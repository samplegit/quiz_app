// ===== 간호조무사 모의고사 퀴즈 앱 =====
// 1단: 1문제, 2단: 2문제 표시

(function () {
  'use strict';

  // --- 회차별 페이지 수 (이미지 폴백용) ---
  const ROUND_PAGES = {
    1:14, 2:14, 3:14, 4:14, 5:14, 6:14,
    7:15, 8:15, 9:15, 10:15, 11:15, 12:15,
    13:15, 14:15, 15:15, 16:15, 18:15
  };

  // --- State ---
  let currentRound = null;
  let currentQIndex = 0;     // 현재 표시 중인 첫 번째 문제 인덱스 (0-based)
  let layoutMode = 1;        // 1 or 2
  let userAnswers = {};      // { questionNum: choiceNum }
  let timerInterval = null;
  let remainingSeconds = 0;
  let examFinished = false;
  let reviewMode = false;

  // --- DOM refs ---
  const $ = id => document.getElementById(id);
  const $startScreen = $('screen-start');
  const $examScreen = $('screen-exam');
  const $resultScreen = $('screen-result');
  const $examSelect = $('exam-select');
  const $btnStart = $('btn-start');
  const $examTitle = $('exam-title');
  const $examRoundLabel = $('exam-round-label');
  const $timerRemaining = $('timer-remaining');
  const $questionArea = $('question-area');
  const $questionContainer = $('question-container');
  const $answerGrid = $('answer-grid');
  const $subjectTabs = $('subject-tabs');
  const $pageIndicator = $('page-indicator');
  const $btnPrev = $('btn-prev');
  const $btnNext = $('btn-next');
  const $btnSubmit = $('btn-submit');
  const $modalOverlay = $('modal-overlay');
  const $modalUnanswered = $('modal-unanswered');
  const $resultTitle = $('result-title');
  const $resultRoundLabel = $('result-round-label');
  const $scoreSummary = $('score-summary');
  const $reviewQuestions = $('review-questions');
  const $reviewGrid = $('review-grid');
  const $reviewPageIndicator = $('review-page-indicator');
  const $btnPrevReview = $('btn-prev-review');
  const $btnNextReview = $('btn-next-review');
  const $btnRetry = $('btn-retry');

  // ===== Helpers =====
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function getSubjectForQ(q) {
    for (const s of SUBJECTS) {
      if (q >= s.start && q <= s.end) return s.name;
    }
    return '';
  }

  function getQuestionData(round, qNum) {
    if (typeof QUESTIONS_DATA !== 'undefined' && QUESTIONS_DATA &&
        QUESTIONS_DATA[round] && QUESTIONS_DATA[round][qNum]) {
      return QUESTIONS_DATA[round][qNum];
    }
    return null;
  }

  function questionsPerPage() {
    return layoutMode;
  }

  function totalPages() {
    return Math.ceil(TOTAL_QUESTIONS / questionsPerPage());
  }

  function currentPageNum() {
    return Math.floor(currentQIndex / questionsPerPage()) + 1;
  }

  // ===== Init =====
  function init() {
    populateExamSelect();
    updateClock();
    setInterval(updateClock, 1000);
    bindEvents();
  }

  function populateExamSelect() {
    Object.keys(ROUND_PAGES).map(Number).sort((a, b) => a - b).forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = `모의고사 ${r}회`;
      $examSelect.appendChild(opt);
    });
  }

  function updateClock() {
    const now = new Date();
    const str = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const el1 = $('current-time');
    const el2 = $('result-time');
    if (el1) el1.textContent = str;
    if (el2) el2.textContent = str;
  }

  // ===== Events =====
  function bindEvents() {
    $examSelect.addEventListener('change', () => {
      $btnStart.disabled = !$examSelect.value;
    });

    $btnStart.addEventListener('click', startExam);
    $btnPrev.addEventListener('click', () => navigate(-1));
    $btnNext.addEventListener('click', () => navigate(1));
    $btnSubmit.addEventListener('click', showSubmitModal);
    $('modal-cancel').addEventListener('click', () => $modalOverlay.classList.add('hidden'));
    $('modal-confirm').addEventListener('click', submitExam);
    $btnPrevReview.addEventListener('click', () => navigateReview(-1));
    $btnNextReview.addEventListener('click', () => navigateReview(1));
    $btnRetry.addEventListener('click', goToStart);

    // Font size
    document.querySelectorAll('.font-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $questionArea.classList.remove('font-small', 'font-large');
        if (btn.dataset.size === 'small') $questionArea.classList.add('font-small');
        if (btn.dataset.size === 'large') $questionArea.classList.add('font-large');
      });
    });

    // Layout
    document.querySelectorAll('.layout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        layoutMode = parseInt(btn.dataset.layout);
        // 현재 문제 기준으로 인덱스 재조정
        currentQIndex = Math.floor(currentQIndex / questionsPerPage()) * questionsPerPage();
        renderQuestions();
        updateNavigation();
      });
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if ($examScreen.classList.contains('active') && !examFinished) {
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
        if (e.key >= '1' && e.key <= '5' && layoutMode === 1) {
          selectAnswer(currentQIndex + 1, parseInt(e.key));
        }
      }
      if ($resultScreen.classList.contains('active')) {
        if (e.key === 'ArrowLeft') navigateReview(-1);
        if (e.key === 'ArrowRight') navigateReview(1);
      }
    });
  }

  // ===== Start Exam =====
  function startExam() {
    currentRound = parseInt($examSelect.value);
    if (!currentRound || !ANSWERS[currentRound]) return;

    currentQIndex = 0;
    layoutMode = 1;
    userAnswers = {};
    examFinished = false;
    reviewMode = false;

    // Reset layout buttons
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.layout-btn[data-layout="1"]').classList.add('active');

    $examTitle.textContent = `모의고사${currentRound}회`;
    $examRoundLabel.textContent = `모의고사${currentRound}회`;

    showScreen('exam');
    buildAnswerPanel(false);
    renderQuestions();
    updateNavigation();
    startTimer();
  }

  // ===== Timer =====
  function startTimer() {
    remainingSeconds = EXAM_TIME_MINUTES * 60;
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remainingSeconds--;
      updateTimerDisplay();
      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        alert('시험 시간이 종료되었습니다. 자동으로 답안이 제출됩니다.');
        submitExam();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    $timerRemaining.textContent = `${pad(m)}:${pad(s)}`;
    $timerRemaining.classList.toggle('warning', remainingSeconds <= 600);
  }

  // ===== Question Rendering =====
  function renderQuestions() {
    const perPage = questionsPerPage();
    const startQ = currentQIndex + 1;
    const endQ = Math.min(currentQIndex + perPage, TOTAL_QUESTIONS);

    $questionContainer.className = 'question-container layout-' + layoutMode;
    $questionContainer.innerHTML = '';

    for (let q = startQ; q <= endQ; q++) {
      const card = createQuestionCard(q, reviewMode);
      $questionContainer.appendChild(card);
    }

    // 답안 패널에서 현재 문제 하이라이트
    highlightCurrentInPanel(startQ, endQ);
  }

  function createQuestionCard(qNum, isReview) {
    const card = document.createElement('div');
    card.className = 'question-card';

    const qData = getQuestionData(String(currentRound), String(qNum));
    const correctAnswer = ANSWERS[currentRound][qNum - 1];
    const userAnswer = userAnswers[qNum];

    // Debug log
    if (!qData || !qData.text) {
      console.log('Missing question data:', { round: currentRound, qNum, qData });
    }

    // Header
    const header = document.createElement('div');
    header.className = 'question-header';

    const numBadge = document.createElement('span');
    numBadge.className = 'question-number';
    numBadge.textContent = qNum;
    header.appendChild(numBadge);

    if (qData && qData.text) {
      const qText = document.createElement('span');
      qText.className = 'question-text';
      qText.textContent = qData.text;
      header.appendChild(qText);
    } else {
      const qText = document.createElement('span');
      qText.className = 'question-text';
      qText.textContent = `문제 ${qNum}`;
      header.appendChild(qText);
    }

    // Review badge
    if (isReview) {
      const badge = document.createElement('span');
      if (userAnswer === correctAnswer) {
        badge.className = 'question-result-badge correct';
        badge.innerHTML = 'O 정답';
      } else {
        badge.className = 'question-result-badge wrong';
        badge.innerHTML = '✕ 오답';
      }
      header.appendChild(badge);
    }

    card.appendChild(header);

    // Choices
    const choicesList = document.createElement('div');
    choicesList.className = 'choices-list';

    const circleNums = ['①', '②', '③', '④', '⑤'];
    for (let c = 1; c <= 5; c++) {
      const item = document.createElement('div');
      item.className = 'choice-item';

      if (isReview) {
        if (c === correctAnswer) item.classList.add('correct-choice');
        if (c === userAnswer && c !== correctAnswer) item.classList.add('wrong-choice');
      } else {
        if (userAnswer === c) item.classList.add('selected');
        item.addEventListener('click', () => selectAnswer(qNum, c));
      }

      const circle = document.createElement('span');
      circle.className = 'choice-circle';
      circle.textContent = circleNums[c - 1];
      item.appendChild(circle);

      const choiceText = document.createElement('span');
      choiceText.className = 'choice-text';
      if (qData && qData.choices && qData.choices[String(c)]) {
        choiceText.textContent = qData.choices[String(c)];
      }
      item.appendChild(choiceText);

      choicesList.appendChild(item);
    }

    card.appendChild(choicesList);

    // Review: show correct answer
    if (isReview && userAnswer !== correctAnswer) {
      const label = document.createElement('div');
      label.className = 'answer-label';
      label.innerHTML = `정답 : <strong>${circleNums[correctAnswer - 1]}</strong>`;
      card.appendChild(label);
    }

    return card;
  }

  // ===== Answer Selection =====
  function selectAnswer(qNum, choice) {
    if (examFinished) return;

    if (userAnswers[qNum] === choice) {
      delete userAnswers[qNum];
    } else {
      userAnswers[qNum] = choice;
    }

    // 문제 카드 UI 업데이트
    renderQuestions();
    // 답안 패널 업데이트
    updateAnswerPanelRow(qNum);
  }

  function updateAnswerPanelRow(qNum) {
    const prefix = reviewMode ? 'review-' : '';
    // Status
    const status = $(`${prefix}status-${qNum}`);
    if (status) {
      status.className = 'q-status';
      if (userAnswers[qNum]) status.classList.add('answered');
    }
    // Buttons
    for (let c = 1; c <= 5; c++) {
      const btn = $(`${prefix}ans-${qNum}-${c}`);
      if (btn) btn.classList.toggle('selected', userAnswers[qNum] === c);
    }
  }

  // ===== Navigation =====
  function navigate(dir) {
    const perPage = questionsPerPage();
    const newIdx = currentQIndex + dir * perPage;
    if (newIdx < 0 || newIdx >= TOTAL_QUESTIONS) return;
    currentQIndex = newIdx;
    renderQuestions();
    updateNavigation();
    $questionArea.scrollTop = 0;
  }

  function updateNavigation() {
    const page = currentPageNum();
    const total = totalPages();
    $pageIndicator.textContent = `${page} / ${total}`;
    $btnPrev.disabled = currentQIndex <= 0;
    $btnNext.disabled = currentQIndex + questionsPerPage() >= TOTAL_QUESTIONS;
  }

  function navigateReview(dir) {
    const perPage = questionsPerPage();
    const newIdx = currentQIndex + dir * perPage;
    if (newIdx < 0 || newIdx >= TOTAL_QUESTIONS) return;
    currentQIndex = newIdx;
    renderReviewQuestions();
    updateReviewNavigation();
    $('review-questions').scrollTop = 0;
  }

  function updateReviewNavigation() {
    const page = currentPageNum();
    const total = totalPages();
    $reviewPageIndicator.textContent = `${page} / ${total}`;
    $btnPrevReview.disabled = currentQIndex <= 0;
    $btnNextReview.disabled = currentQIndex + questionsPerPage() >= TOTAL_QUESTIONS;
  }

  function goToQuestion(qNum) {
    const perPage = questionsPerPage();
    currentQIndex = Math.floor((qNum - 1) / perPage) * perPage;
    if (reviewMode) {
      renderReviewQuestions();
      updateReviewNavigation();
    } else {
      renderQuestions();
      updateNavigation();
      $questionArea.scrollTop = 0;
    }
  }

  // ===== Answer Panel =====
  function buildAnswerPanel(isReview) {
    const grid = isReview ? $reviewGrid : $answerGrid;
    const tabsContainer = isReview ? null : $subjectTabs;

    // Subject tabs (exam only)
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
      SUBJECTS.forEach((subj, i) => {
        const tab = document.createElement('div');
        tab.className = 'subject-tab' + (i === 0 ? ' active' : '');
        tab.textContent = subj.name;
        tab.addEventListener('click', () => {
          document.querySelectorAll('#subject-tabs .subject-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          goToQuestion(subj.start);
        });
        tabsContainer.appendChild(tab);
      });
    }

    // Grid
    grid.innerHTML = '';
    const answers = ANSWERS[currentRound];

    for (let q = 1; q <= TOTAL_QUESTIONS; q++) {
      const subj = getSubjectForQ(q);
      const prevSubj = q > 1 ? getSubjectForQ(q - 1) : '';
      const isNewSection = subj !== prevSubj;

      const row = document.createElement('div');
      row.className = 'answer-row' + (isNewSection ? ' section-start' : '');
      row.id = (isReview ? 'review-row-' : 'row-') + q;
      row.addEventListener('click', () => goToQuestion(q));

      // Status circle
      const status = document.createElement('span');
      status.className = 'q-status';
      status.id = (isReview ? 'review-status-' : 'status-') + q;

      if (isReview) {
        const correctAnswer = answers[q - 1];
        const userAnswer = userAnswers[q];
        if (userAnswer === correctAnswer) status.classList.add('correct');
        else if (userAnswer) status.classList.add('wrong');
        else status.classList.add('unanswered');
      } else if (userAnswers[q]) {
        status.classList.add('answered');
      }

      // Number
      const num = document.createElement('span');
      num.className = 'q-num';
      num.textContent = q;

      // Choice buttons
      const choices = document.createElement('span');
      choices.className = 'q-choices';

      for (let c = 1; c <= 5; c++) {
        const btn = document.createElement('button');
        btn.className = 'ans-choice-btn';
        btn.textContent = c;
        btn.id = (isReview ? 'review-ans-' : 'ans-') + q + '-' + c;

        if (isReview) {
          const correctAnswer = answers[q - 1];
          const userAnswer = userAnswers[q];
          if (c === correctAnswer) btn.classList.add('correct-answer');
          if (c === userAnswer && c !== correctAnswer) btn.classList.add('wrong-answer');
        } else {
          if (userAnswers[q] === c) btn.classList.add('selected');
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectAnswer(q, c);
          });
        }

        choices.appendChild(btn);
      }

      row.appendChild(status);
      row.appendChild(num);
      row.appendChild(choices);
      grid.appendChild(row);
    }
  }

  function highlightCurrentInPanel(startQ, endQ) {
    const prefix = reviewMode ? 'review-' : '';
    document.querySelectorAll('.answer-row.current').forEach(r => r.classList.remove('current'));
    for (let q = startQ; q <= endQ; q++) {
      const row = $(prefix + 'row-' + q);
      if (row) row.classList.add('current');
    }
  }

  // ===== Submit =====
  function showSubmitModal() {
    const answered = Object.keys(userAnswers).length;
    const unanswered = TOTAL_QUESTIONS - answered;
    $modalUnanswered.textContent = unanswered > 0
      ? `미응답 문항이 ${unanswered}개 있습니다.`
      : '모든 문항에 응답하였습니다.';
    $modalOverlay.classList.remove('hidden');
  }

  function submitExam() {
    $modalOverlay.classList.add('hidden');
    if (timerInterval) clearInterval(timerInterval);
    examFinished = true;
    reviewMode = true;
    showResults();
  }

  // ===== Results =====
  function showResults() {
    currentQIndex = 0;
    const answers = ANSWERS[currentRound];

    // Calculate scores
    const subjectScores = {};
    SUBJECTS.forEach(subj => {
      let correct = 0;
      for (let q = subj.start; q <= subj.end; q++) {
        if (userAnswers[q] === answers[q - 1]) correct++;
      }
      const total = subj.end - subj.start + 1;
      subjectScores[subj.name] = {
        correct, total,
        passed: correct / total >= PASS_CRITERIA[subj.name].passRate
      };
    });

    let totalCorrect = 0;
    for (let q = 1; q <= TOTAL_QUESTIONS; q++) {
      if (userAnswers[q] === answers[q - 1]) totalCorrect++;
    }
    const totalPassed = totalCorrect / TOTAL_QUESTIONS >= TOTAL_PASS_RATE;
    const allSubjectsPassed = SUBJECTS.every(s => subjectScores[s.name].passed);
    const finalPass = totalPassed && allSubjectsPassed;

    // Render score summary
    $scoreSummary.innerHTML = '';
    SUBJECTS.forEach(subj => {
      const sc = subjectScores[subj.name];
      const card = document.createElement('div');
      card.className = 'score-card';
      card.innerHTML = `
        <div class="label">${subj.name}</div>
        <div class="value ${sc.passed ? 'pass' : 'fail'}">${sc.correct} / ${sc.total}
          <span class="pass-tag ${sc.passed ? 'pass-yes' : 'pass-no'}">${sc.passed ? '합격' : '불합격'}</span>
        </div>`;
      $scoreSummary.appendChild(card);
    });

    // Pass/Fail card
    const passCard = document.createElement('div');
    passCard.className = 'score-card';
    passCard.innerHTML = `
      <div class="label">합격여부</div>
      <div class="value ${finalPass ? 'pass' : 'fail'}">
        <span class="pass-tag ${finalPass ? 'pass-yes' : 'pass-no'}" style="font-size:1rem;">${finalPass ? '합격' : '불합격'}</span>
      </div>`;
    $scoreSummary.appendChild(passCard);

    // Total score card
    const totalCard = document.createElement('div');
    totalCard.className = 'score-card';
    totalCard.innerHTML = `
      <div class="label">점수</div>
      <div class="value">${totalCorrect} / ${TOTAL_QUESTIONS}</div>`;
    $scoreSummary.appendChild(totalCard);

    $resultTitle.textContent = `모의고사${currentRound}회 결과`;
    $resultRoundLabel.textContent = `모의고사${currentRound}회`;

    buildAnswerPanel(true);
    renderReviewQuestions();
    updateReviewNavigation();
    showScreen('result');
  }

  function renderReviewQuestions() {
    const perPage = questionsPerPage();
    const startQ = currentQIndex + 1;
    const endQ = Math.min(currentQIndex + perPage, TOTAL_QUESTIONS);

    const container = document.createElement('div');
    container.className = 'question-container layout-' + layoutMode;

    for (let q = startQ; q <= endQ; q++) {
      const card = createQuestionCard(q, true);
      container.appendChild(card);
    }

    $reviewQuestions.innerHTML = '';
    $reviewQuestions.appendChild(container);

    highlightCurrentInPanel(startQ, endQ);
  }

  // ===== Screen =====
  function showScreen(name) {
    $startScreen.classList.remove('active');
    $examScreen.classList.remove('active');
    $resultScreen.classList.remove('active');
    if (name === 'start') $startScreen.classList.add('active');
    if (name === 'exam') $examScreen.classList.add('active');
    if (name === 'result') $resultScreen.classList.add('active');
  }

  function goToStart() {
    if (timerInterval) clearInterval(timerInterval);
    examFinished = false;
    reviewMode = false;
    currentRound = null;
    userAnswers = {};
    $examSelect.value = '';
    $btnStart.disabled = true;
    showScreen('start');
  }

  // ===== Boot =====
  init();
})();
