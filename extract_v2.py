#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
간호조무사 모의고사 - OCR 기반 문제 추출 v2
더 강건한 파싱 로직
"""
import easyocr, os, sys, json, re, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

IMAGE_DIR = r'D:\claude_workspace\quiz_app\images'
OUTPUT_FILE = r'D:\claude_workspace\quiz_app\questions_data.js'

ROUND_PAGES = {
    1:14, 2:14, 3:14, 4:14, 5:14, 6:14,
    7:15, 8:15, 9:15, 10:15, 11:15, 12:15,
    13:15, 14:15, 15:15, 16:15, 18:15
}

def ocr_page(reader, img_path):
    """한 페이지 OCR -> (y, text) 리스트"""
    result = reader.readtext(img_path, detail=1, paragraph=False)
    lines = []
    for bbox, text, conf in result:
        y = int(bbox[0][1])
        x = int(bbox[0][0])
        lines.append({'y': y, 'x': x, 'text': text.strip(), 'conf': conf})
    lines.sort(key=lambda l: (l['y'], l['x']))
    return lines


def merge_same_y_lines(lines, threshold=20):
    """같은 y 좌표 라인을 하나로 병합"""
    if not lines:
        return []
    merged = []
    current = lines[0].copy()
    for l in lines[1:]:
        if abs(l['y'] - current['y']) < threshold:
            current['text'] += '  ' + l['text']
        else:
            merged.append(current)
            current = l.copy()
    merged.append(current)
    return merged


def parse_round(reader, round_num):
    """한 회차 전체를 OCR하고 파싱"""
    pages = ROUND_PAGES[round_num]
    all_lines = []

    for p in range(1, pages + 1):
        img = os.path.join(IMAGE_DIR, f'round{round_num}_page{p}.jpg')
        if not os.path.exists(img):
            continue
        page_lines = ocr_page(reader, img)
        # y offset for page ordering
        offset = (p - 1) * 20000
        for l in page_lines:
            l['y'] += offset
        all_lines.extend(page_lines)

    # 같은 줄 병합
    merged = merge_same_y_lines(all_lines)

    # 문제 파싱
    questions = {}
    current_q_num = None
    current_q_text = []
    current_choices = []

    # 헤더/풋터 필터링 키워드
    skip_keywords = ['적중', '간호조무사국가시험', '모의고사', '본 모의고사는',
                     '전국간호', '제공하는', '가장 적합한 답']

    for line in merged:
        text = line['text'].strip()
        if not text:
            continue

        # 헤더/풋터 건너뛰기
        skip = False
        for kw in skip_keywords:
            if kw in text:
                skip = True
                break
        if skip and not re.match(r'^\d{1,3}\s', text):
            continue

        # 문제 번호 시작 패턴
        q_match = re.match(r'^(\d{1,3})\s*[.\s]+(.+)', text)
        if q_match:
            num = int(q_match.group(1))
            if 1 <= num <= 105:
                # 이전 문제 저장
                if current_q_num is not None:
                    save_question(questions, current_q_num, current_q_text, current_choices)

                current_q_num = num
                current_q_text = [q_match.group(2).strip()]
                current_choices = []
                continue

        if current_q_num is None:
            continue

        # 보기 체크 - ① ~ ⑤ 패턴
        circle_syms = {'①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5}
        found_choice = False
        for sym, n in circle_syms.items():
            if sym in text:
                # 한 줄에 여러 보기가 있을 수 있음
                parts = re.split(r'([①②③④⑤])', text)
                i = 0
                while i < len(parts):
                    if parts[i] in circle_syms:
                        c_num = circle_syms[parts[i]]
                        c_text = parts[i+1].strip() if i+1 < len(parts) else ''
                        current_choices.append((c_num, c_text))
                        i += 2
                    else:
                        i += 1
                found_choice = True
                break

        if found_choice:
            continue

        # 보기가 없으면 문제 텍스트 이어붙이기
        # 단, 이미 보기가 시작된 경우 마지막 보기에 이어붙이기
        if current_choices:
            # 마지막 보기에 추가
            last_num, last_text = current_choices[-1]
            current_choices[-1] = (last_num, last_text + ' ' + text)
        else:
            current_q_text.append(text)

    # 마지막 문제 저장
    if current_q_num is not None:
        save_question(questions, current_q_num, current_q_text, current_choices)

    return questions


def save_question(questions, q_num, q_text_parts, choices):
    """문제를 딕셔너리에 저장"""
    q_text = ' '.join(q_text_parts).strip()
    # 보기 정리
    choice_dict = {}
    for c_num, c_text in choices:
        c_text = c_text.strip()
        if c_text:
            choice_dict[c_num] = c_text

    # 보기가 5개 미만이면 빈 보기 추가
    for i in range(1, 6):
        if i not in choice_dict:
            choice_dict[i] = ''

    questions[q_num] = {
        'text': q_text,
        'choices': {str(k): v for k, v in sorted(choice_dict.items())}
    }


def main():
    print("EasyOCR 초기화 중...")
    reader = easyocr.Reader(['ko', 'en'], gpu=False, verbose=False)

    all_data = {}
    rounds = sorted(ROUND_PAGES.keys())

    for r in rounds:
        print(f"제{r}회 처리 중 ({ROUND_PAGES[r]}페이지)...", flush=True)
        questions = parse_round(reader, r)
        all_data[str(r)] = {}
        for q_num, q_data in sorted(questions.items()):
            all_data[str(r)][str(q_num)] = q_data
        found = len(questions)
        print(f"  -> {found}문제 추출 완료", flush=True)

    # JS 파일로 저장
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write("// 간호조무사 모의고사 문제 데이터 (OCR 추출)\n")
        f.write("// 이미지가 포함된 문제는 텍스트가 불완전할 수 있음\n")
        f.write("const QUESTIONS_DATA = ")
        json.dump(all_data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"\n저장 완료: {OUTPUT_FILE}")

    # 통계
    total = 0
    for r in rounds:
        cnt = len(all_data[str(r)])
        total += cnt
        print(f"  제{r}회: {cnt}문제")
    print(f"  총: {total}문제")


if __name__ == '__main__':
    main()
