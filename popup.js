document.addEventListener('DOMContentLoaded', () => {
    const summarizeBtn = document.getElementById('summarize');
    const askQuestionBtn = document.getElementById('ask-question');
    const askBtn = document.getElementById('ask');
    const summaryContainer = document.getElementById('summary-container');
    const qaContainer = document.getElementById('qa-container');
    const answerContainer = document.getElementById('answer-container');
    const summaryEl = document.getElementById('summary');
    const answerEl = document.getElementById('answer');
    const questionEl = document.getElementById('question');
    const modelSelect = document.getElementById('model-select');

    summarizeBtn.addEventListener('click', () => {
        qaContainer.style.display = 'none';
        summaryContainer.style.display = 'block';
        chrome.runtime.sendMessage({
            action: "summarize",
            model: modelSelect.value
        }, (response) => {
            summaryEl.innerText = response.summary;
        });
    });

    askQuestionBtn.addEventListener('click', () => {
        summaryContainer.style.display = 'none';
        qaContainer.style.display = 'block';
    });

    askBtn.addEventListener('click', () => {
        const question = questionEl.value;
        if (question) {
            answerContainer.style.display = 'block';
            chrome.runtime.sendMessage({
                action: "ask",
                question: question,
                model: modelSelect.value
            }, (response) => {
                answerEl.innerText = response.answer;
            });
        }
    });
});
