document.getElementById('summarize').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: "summarize"}, (response) => {
      document.getElementById('summary').innerText = response.summary;
      document.getElementById('summary-container').style.display = 'block';
    });
  });
});

document.getElementById('ask').addEventListener('click', () => {
  const question = document.getElementById('question').value;
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: "ask", question: question}, (response) => {
      document.getElementById('answer').innerText = response.answer;
      document.getElementById('answer-container').style.display = 'block';
    });
  });
});
