chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "summarize") {
    const pageText = document.body.innerText;
    // In a real extension, you would send this text to a Gen-AI API
    // For this example, we'll just return a placeholder summary
    sendResponse({summary: "This is a placeholder summary of the page."});
  } else if (request.action === "ask") {
    const pageText = document.body.innerText;
    const question = request.question;
    // In a real extension, you would send the page text and question to a Gen-AI API
    // For this example, we'll just return a placeholder answer
    sendResponse({answer: `This is a placeholder answer to your question: "${question}"`});
  }
});
