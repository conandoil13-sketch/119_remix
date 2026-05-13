import { remixRappers } from "./data/rappers.js";
import { triviaQuestions } from "./data/trivia.js";

const QUESTION_COUNT = 25;
const BASE_SCORE = 40;
const MIN_CORRECT_SCORE = 10;
const AUTO_LYRIC_QUESTIONS_PER_RAPPER = 3;
const circledNumbers = ["①", "②", "③", "④", "⑤"];

const state = {
  questions: [],
  currentIndex: 0,
  selectedIndex: null,
  score: 0,
  answered: false,
  questionStartedAt: 0,
  timerId: null,
  correctCount: 0,
};

const elements = {
  introScreen: document.querySelector("#introScreen"),
  examScreen: document.querySelector("#examScreen"),
  startButton: document.querySelector("#startButton"),
  questionNumber: document.querySelector("#questionNumber"),
  questionType: document.querySelector("#questionType"),
  questionText: document.querySelector("#questionText"),
  lyricsBox: document.querySelector("#lyricsBox"),
  choicesList: document.querySelector("#choicesList"),
  timerText: document.querySelector("#timerText"),
  progressBar: document.querySelector("#progressBar"),
  quitButton: document.querySelector("#quitButton"),
  submitButton: document.querySelector("#submitButton"),
  nextButton: document.querySelector("#nextButton"),
  reportLayer: document.querySelector("#reportLayer"),
  gradeMark: document.querySelector("#gradeMark"),
  scoreText: document.querySelector("#scoreText"),
  reportSummary: document.querySelector("#reportSummary"),
  restartButton: document.querySelector("#restartButton"),
};

elements.startButton.addEventListener("click", startExam);
elements.quitButton.addEventListener("click", () => finishExam("중도 포기"));
elements.submitButton.addEventListener("click", submitAnswer);
elements.nextButton.addEventListener("click", goToNextQuestion);
elements.restartButton.addEventListener("click", startExam);

async function startExam() {
  elements.startButton.disabled = true;
  elements.restartButton.disabled = true;
  await loadLyricsFromTextFiles();
  elements.startButton.disabled = false;
  elements.restartButton.disabled = false;

  state.questions = buildExamQuestions();
  state.currentIndex = 0;
  state.selectedIndex = null;
  state.score = 0;
  state.answered = false;
  state.correctCount = 0;

  elements.introScreen.classList.add("hidden");
  elements.reportLayer.classList.add("hidden");
  elements.examScreen.classList.remove("hidden");

  renderQuestion();
}

async function loadLyricsFromTextFiles() {
  await Promise.all(remixRappers.map(async (rapper) => {
    const response = await fetch(`./data/lyrics/${String(rapper.order).padStart(2, "0")}.txt`, {
      cache: "no-store",
    }).catch(() => null);

    if (!response?.ok) return;

    const lyrics = parseLyricsTextFile(await response.text());
    if (lyrics) {
      rapper.lyrics = lyrics;
    }
  }));
}

function parseLyricsTextFile(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .trim();
}

function buildExamQuestions() {
  const pool = [
    ...buildLyricQuestions(),
    ...buildOrderQuestions(80),
    ...triviaQuestions.map(normalizeTriviaQuestion),
  ];

  return shuffle(pool).slice(0, QUESTION_COUNT);
}

function buildLyricQuestions() {
  return remixRappers.flatMap((rapper) => {
    if (!rapper.lyrics) return [];

    return [
      ...buildRandomLyricQuestions(rapper),
      ...buildManualLyricQuestions(rapper),
    ];
  });
}

function buildRandomLyricQuestions(rapper) {
  const lyricLines = getLyricLines(rapper.lyrics);

  if (lyricLines.length < 5 || getAllLyricLines().length < 5) return [];

  return Array.from({ length: AUTO_LYRIC_QUESTIONS_PER_RAPPER }, (_, index) => {
    const answer = pickOne(lyricLines);
    const lyrics = blankRandomLyricLine(rapper.lyrics, answer);
    const choices = makeLyricChoices(answer);

    return {
      id: `lyrics-auto-${rapper.order}-${index}-${answer}`,
      type: "lyrics",
      title: "가사 빈칸",
      question: `${displayRapperName(rapper)} 파트의 빈칸에 들어갈 한 줄을 고르시오.`,
      lyrics,
      choices,
      answer,
    };
  }).filter((question) => question.choices.length === 5);
}

function buildManualLyricQuestions(rapper) {
  if (!Array.isArray(rapper.lyricBlanks)) return [];

  return rapper.lyricBlanks
    .filter((blank) => blank.answer)
    .map((blank) => {
      const choices = makeLyricChoices(blank.answer, blank.distractors);

      return {
        id: blank.id,
        type: "lyrics",
        title: "가사 빈칸",
        question: blank.question || `${displayRapperName(rapper)} 파트의 빈칸에 들어갈 말을 고르시오.`,
        lyrics: blank.blankedLyrics || blankRandomLyricLine(rapper.lyrics, blank.answer),
        choices,
        answer: blank.answer,
      };
    })
    .filter((question) => question.choices.length === 5);
}

function makeLyricChoices(answer, preferredDistractors = []) {
  const distractors = [
    ...preferredDistractors,
    ...shuffle(getAllLyricLines()),
  ].filter((line) => line && line !== answer);

  return shuffle([answer, ...uniqueItems(distractors).slice(0, 4)]);
}

function blankRandomLyricLine(lyrics, answer) {
  const lines = lyrics.split(/\r?\n/);
  const answerIndex = lines.findIndex((line) => normalizeLine(line) === answer);
  const indexToBlank = answerIndex >= 0 ? answerIndex : randomInt(0, lines.length - 1);

  return lines
    .map((line, index) => (index === indexToBlank && normalizeLine(line) ? "____" : line))
    .join("\n");
}

function buildOrderQuestions(count) {
  const questions = [];
  const maxStart = remixRappers.length - 7;

  for (let i = 0; i < count; i += 1) {
    const length = randomInt(3, 5);
    const mode = pickOne(["after", "before", "between"]);
    const startIndex = randomInt(0, maxStart);
    const answerStart = mode === "before" ? startIndex + 1 : startIndex;
    const answerSlice = remixRappers.slice(answerStart, answerStart + length);

    if (answerSlice.length !== length) continue;

    const before = remixRappers[answerStart - 1];
    const after = remixRappers[answerStart + length];
    const question = makeOrderPrompt(mode, before, after, length);
    const answer = formatRapperSequence(answerSlice);
    const choices = makeOrderChoices(answerSlice, answer);

    questions.push({
      id: `order-${i}-${answerStart}-${length}-${mode}`,
      type: "order",
      title: "순서 배열",
      question,
      choices,
      answer,
    });
  }

  return questions;
}

function makeOrderPrompt(mode, before, after, length) {
  if (mode === "after" && before) {
    return `${displayRapperName(before)} 다음에 이어지는 ${length}명의 순서로 가장 알맞은 것을 고르시오.`;
  }

  if (mode === "before" && after) {
    return `${displayRapperName(after)} 앞에 나오는 ${length}명의 순서로 가장 알맞은 것을 고르시오.`;
  }

  if (before && after) {
    return `${displayRapperName(before)}와 ${displayRapperName(after)} 사이에 들어갈 ${length}명의 순서로 가장 알맞은 것을 고르시오.`;
  }

  return `119 REMIX에서 이어지는 ${length}명의 순서로 가장 알맞은 것을 고르시오.`;
}

function makeOrderChoices(answerSlice, answer) {
  const choices = new Set([answer]);
  const answerOrders = new Set(answerSlice.map((rapper) => rapper.order));

  while (choices.size < 5) {
    const variant = answerSlice.map((rapper) => ({ ...rapper }));
    const mutation = pickOne(["replace", "swap"]);

    if (mutation === "swap") {
      const index = randomInt(0, variant.length - 2);
      [variant[index], variant[index + 1]] = [variant[index + 1], variant[index]];
    } else {
      const replaceIndex = randomInt(0, variant.length - 1);
      const nearby = remixRappers.filter((rapper) => {
        const distance = Math.abs(rapper.order - answerSlice[replaceIndex].order);
        return distance > 0 && distance <= 4 && !answerOrders.has(rapper.order);
      });
      variant[replaceIndex] = pickOne(nearby.length ? nearby : remixRappers);
    }

    choices.add(formatRapperSequence(variant));
  }

  return shuffle([...choices]);
}

function normalizeTriviaQuestion(question) {
  return {
    ...question,
    title: question.title || "상식 퀴즈",
    choices: shuffle(question.choices).slice(0, 5),
  };
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  state.selectedIndex = null;
  state.answered = false;
  state.questionStartedAt = performance.now();
  elements.submitButton.disabled = true;
  elements.submitButton.classList.remove("hidden");
  elements.nextButton.classList.add("hidden");

  elements.questionNumber.textContent = `문항 ${state.currentIndex + 1}`;
  elements.questionType.textContent = question.title;
  elements.questionText.textContent = question.question;
  elements.progressBar.style.width = `${(state.currentIndex / QUESTION_COUNT) * 100}%`;

  if (question.lyrics) {
    elements.lyricsBox.textContent = question.lyrics;
    elements.lyricsBox.classList.remove("hidden");
  } else {
    elements.lyricsBox.textContent = "";
    elements.lyricsBox.classList.add("hidden");
  }

  elements.choicesList.innerHTML = "";
  question.choices.forEach((choice, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.innerHTML = `<span class="choice-mark">${circledNumbers[index]}</span><span>${escapeHtml(choice)}</span>`;
    button.addEventListener("click", () => selectChoice(index));
    item.append(button);
    elements.choicesList.append(item);
  });

  restartTimer();
}

function selectChoice(index) {
  if (state.answered) return;

  state.selectedIndex = index;
  elements.submitButton.disabled = false;

  [...elements.choicesList.querySelectorAll(".choice-button")].forEach((button, buttonIndex) => {
    button.classList.toggle("selected", buttonIndex === index);
  });
}

function submitAnswer() {
  if (state.selectedIndex === null || state.answered) return;

  state.answered = true;
  stopTimer();

  const question = state.questions[state.currentIndex];
  const selectedChoice = question.choices[state.selectedIndex];
  const earned = selectedChoice === question.answer ? calculateQuestionScore() : 0;
  state.score += earned;
  if (earned > 0) state.correctCount += 1;

  [...elements.choicesList.querySelectorAll(".choice-button")].forEach((button, index) => {
    const choice = question.choices[index];
    button.disabled = true;
    if (choice === question.answer) button.classList.add("correct");
    if (index === state.selectedIndex && choice !== question.answer) button.classList.add("wrong");
  });

  elements.submitButton.classList.add("hidden");
  elements.nextButton.textContent = state.currentIndex + 1 === QUESTION_COUNT ? "성적표 보기" : "다음 문항";
  elements.nextButton.classList.remove("hidden");
}

function goToNextQuestion() {
  if (state.currentIndex + 1 >= QUESTION_COUNT) {
    finishExam("시험 종료");
    return;
  }

  state.currentIndex += 1;
  renderQuestion();
}

function finishExam(reason) {
  stopTimer();
  elements.examScreen.classList.add("hidden");
  elements.introScreen.classList.add("hidden");
  elements.reportLayer.classList.remove("hidden");

  const finalScore = roundScore(state.score);
  elements.gradeMark.textContent = getGrade(finalScore);
  elements.scoreText.textContent = `${finalScore.toFixed(2)}점`;
  elements.reportSummary.textContent = `${reason}. ${state.currentIndex + (state.answered ? 1 : 0)}문항 중 ${state.correctCount}문항을 맞혔습니다.`;
}

function calculateQuestionScore() {
  const elapsedSeconds = (performance.now() - state.questionStartedAt) / 1000;
  return Math.max(MIN_CORRECT_SCORE, BASE_SCORE - elapsedSeconds);
}

function restartTimer() {
  stopTimer();
  updateTimer();
  state.timerId = window.setInterval(updateTimer, 50);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimer() {
  const elapsedSeconds = (performance.now() - state.questionStartedAt) / 1000;
  elements.timerText.textContent = `${elapsedSeconds.toFixed(2)}초`;
}

function getGrade(score) {
  if (score >= 900) return "A";
  if (score >= 800) return "B";
  if (score >= 600) return "C";
  if (score >= 400) return "D";
  return "F";
}

function formatRapperSequence(rappers) {
  return rappers.map(displayRapperName).join(" → ");
}

function getAllLyricLines() {
  return uniqueItems(remixRappers.flatMap((rapper) => getLyricLines(rapper.lyrics)));
}

function getLyricLines(lyrics = "") {
  return lyrics
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length >= 2);
}

function normalizeLine(line = "") {
  return line.trim().replace(/\s+/g, " ");
}

function displayRapperName(rapper) {
  return rapper.koreanName ? `${rapper.name}(${rapper.koreanName})` : rapper.name;
}

function roundScore(score) {
  return Math.round(score * 100) / 100;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function uniqueItems(items) {
  return [...new Set(items)];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
