chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContent") {
        sendResponse({ content: document.body.innerText });
    }
    return true; // Indicates that the response is sent asynchronously
});
