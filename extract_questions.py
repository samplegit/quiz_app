#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
간호조무사 모의고사 PDF 이미지에서 문제 텍스트 추출
EasyOCR을 사용하여 각 페이지의 문제/보기를 구조화된 데이터로 변환
"""
import easyocr
import os, sys, json, re, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

IMAGE_DIR = r'D:\claude_workspace\quiz_app\images'
OUTPUT_FILE = r'D:\claude_workspace\quiz_app\questions_data.js'

ROUND_PAGES = {
    1:14, 2:14, 3:14, 4:14, 5:14, 6:14,
    7:15, 8:15, 9:15, 10:15, 11:15, 12:15,
    13:15, 14:15, 15:15, 16:15, 18:15
}

def extract_round(reader, round_num):
    """한 회차의 모든 페이지에서 문제를 추출"""
    pages = ROUND_PAGES[round_num]
    all_lines = []

    for p in range(1, pages + 1):
        img_path = os.path.join(IMAGE_DIR, f'round{round_num}_page{p}.jpg')
        if not os.path.exists(img_path):
            print(f'  [WARN] Missing: {img_path}', file=sys.stderr)
            continue

        result = reader.readtext(img_path, detail=1, paragraph=False)
        # Sort by y position
        lines = [(int(bbox[0][1]), text, conf) for bbox, text, conf in result]
        lines.sort(key=lambda x: x[0])
        all_lines.extend(lines)

    return all_lines


def parse_questions(lines, round_num):
    """
    OCR 결과를 문제 단위로 파싱.
    문제 번호 패턴: "숫자" 또는 "숫자." 또는 "숫자 문제텍스트"
    보기 패턴: ① ② ③ ④ ⑤ 또는 (1) (2) 등
    """
    questions = {}
    current_q = None
    current_text = ""
    current_choices = {}

    # 원본 텍스트를 그대로 연결
    raw_text = "\n".join(text for _, text, _ in lines)

    # 문제 번호 패턴으로 분할
    # 숫자가 줄 시작에 오거나 독립적으로 등장
    # 패턴: 줄바꿈 후 숫자 + 점 또는 공백 + 텍스트
    q_pattern = re.compile(r'(?:^|\n)\s*(\d{1,3})\s*[.\s](.+?)(?=(?:\n\s*\d{1,3}\s*[.\s])|\Z)', re.DOTALL)

    # 더 간단한 접근: 줄 단위로 파싱
    merged_text = []
    for _, text, conf in lines:
        merged_text.append(text.strip())

    full_text = "\n".join(merged_text)

    # 문제 경계 찾기 - "숫자" 패턴 (1~105)
    # 각 줄에서 문제번호 시작을 탐지
    q_starts = []
    for i, (y, text, conf) in enumerate(lines):
        text = text.strip()
        # 문제 번호로 시작하는 경우
        m = re.match(r'^(\d{1,3})\s*[.\s](.+)', text)
        if m:
            num = int(m.group(1))
            if 1 <= num <= 105:
                q_starts.append((i, num, m.group(2).strip()))

    # 문제별 텍스트 수집
    for idx, (start_i, q_num, first_text) in enumerate(q_starts):
        end_i = q_starts[idx + 1][0] if idx + 1 < len(q_starts) else len(lines)

        # 문제 텍스트와 보기 수집
        q_text_parts = [first_text]
        choices = {}

        for i in range(start_i + 1, end_i):
            _, text, _ = lines[i]
            text = text.strip()

            # Skip headers
            if '적중' in text or '간호조무사' in text or '모의고사' in text:
                continue
            if text in ['두통', '적중']:  # common false header matches
                # Could be a choice text though - check context
                pass

            # 보기 패턴 체크: ①~⑤ 또는 숫자만
            choice_match = re.match(r'^[①②③④⑤]\s*(.*)', text)
            if not choice_match:
                choice_match = re.match(r'^[\(]?([1-5])[\)]?\s+(.+)', text)
                if choice_match:
                    c_num = int(choice_match.group(1))
                    c_text = choice_match.group(2).strip()
                    choices[c_num] = c_text
                    continue

            if choice_match:
                circle_map = {'①':1, '②':2, '③':3, '④':4, '⑤':5}
                for sym, n in circle_map.items():
                    if text.startswith(sym):
                        choices[n] = text[1:].strip()
                        break
                continue

            q_text_parts.append(text)

        q_text = " ".join(q_text_parts).strip()

        # 텍스트 내에서 보기 추출 시도
        if len(choices) < 3:
            # 보기가 한 줄에 2개씩 있는 경우
            for part in q_text_parts:
                for sym, n in [('①',1),('②',2),('③',3),('④',4),('⑤',5)]:
                    if sym in part:
                        idx2 = part.index(sym)
                        rest = part[idx2+1:].strip()
                        # 다음 보기 기호까지
                        next_sym_pos = len(rest)
                        for s2 in ['①','②','③','④','⑤']:
                            if s2 in rest:
                                p2 = rest.index(s2)
                                if p2 < next_sym_pos:
                                    next_sym_pos = p2
                        choices[n] = rest[:next_sym_pos].strip()

        questions[q_num] = {
            "question": q_text,
            "choices": choices
        }

    return questions


def main():
    print("EasyOCR 리더 초기화 중...", file=sys.stderr)
    reader = easyocr.Reader(['ko', 'en'], gpu=False, verbose=False)

    all_data = {}

    rounds = sorted(ROUND_PAGES.keys())
    for r in rounds:
        print(f"\n=== 제{r}회 처리 중 ({ROUND_PAGES[r]} 페이지) ===", file=sys.stderr)
        lines = extract_round(reader, r)
        print(f"  OCR 결과: {len(lines)} 텍스트 블록", file=sys.stderr)

        questions = parse_questions(lines, r)
        print(f"  파싱된 문제: {len(questions)}개", file=sys.stderr)

        all_data[r] = questions

    # JSON으로 저장
    # JS 파일로 출력
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write("// 간호조무사 모의고사 문제 데이터 (OCR 추출)\n")
        f.write("const QUESTIONS_DATA = ")
        json.dump(all_data, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"\n완료! {OUTPUT_FILE} 저장됨", file=sys.stderr)

    # 통계
    for r in rounds:
        print(f"  제{r}회: {len(all_data[r])}문제", file=sys.stderr)


if __name__ == '__main__':
    main()
