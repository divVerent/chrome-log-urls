/**
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const requestsPerTab: Record<number, chrome.webRequest.WebRequestHeadersDetails[]> = {};

function shellEscape(str: string): string {
	return `'${str.replace(/'/g, "'\\''")}'`;
}

function requestOverview(details: chrome.webRequest.WebRequestHeadersDetails): string {
	return details.type;
}

function requestCommandHTML(details: chrome.webRequest.WebRequestHeadersDetails): HTMLElement {
	let curlCommand = 'curl';
	curlCommand += ` -X ${shellEscape(details.method)}`;
	if (details.requestHeaders != null) {
		for (const header of details.requestHeaders) {
			const name = header.name;
			let value = header.value;
			if (value == null) {
				continue;
			}
			if (name.toLowerCase() === 'accept-encoding') {
				// Gzip confuses curlers.
				continue;
			}
			if (name.toLowerCase() === 'range') {
				// We do not want to download incomplete files.
				// But when we see a range request, we must assume the site requires them.
				// So let's put a dummy range request in.
				value = 'bytes=0-';
			}
			curlCommand += ` -H ${shellEscape(name)}:${shellEscape(value)}`;
		}
	}
	curlCommand += ' ';
	const node = document.createElement('span');
	node.appendChild(document.createTextNode(curlCommand));
	const link = document.createElement('a');
	link.href = details.url;
	link.target = '_blank';
	link.appendChild(document.createTextNode(shellEscape(details.url)));
	node.appendChild(link);
	return node;
}

function updateBrowserAction() {
	chrome.tabs.query({
		'active': true,
		'currentWindow': true
	}, (tabs) => {
		if (tabs.length != 1) {
			return;
		}
		const tabId = tabs[0].id;
		if (tabId == null) {
			console.error('Active tab has no ID.');
			return;
		}
		const requests = requestsPerTab[tabId];
		chrome.browserAction.setBadgeText({
			text: requests ? requests.length.toString() : ''
		});
	});
}

function handleRequest(details: chrome.webRequest.WebRequestHeadersDetails) {
	if (!(details.tabId in requestsPerTab)) {
		return;
	}
	requestsPerTab[details.tabId].push(details);
	updateBrowserAction();
}

function showRequests(requests: chrome.webRequest.WebRequestHeadersDetails[]) {
	const tab = window.open();
	if (tab == null) {
		console.error('Could not open a new window.');
		return;
	}
	const dl = tab.document.createElement('dl');
	for (const request of requests) {
		const dt = tab.document.createElement('dt');
		dt.appendChild(tab.document.createTextNode(requestOverview(request)));
		dl.appendChild(dt);
		const dd = tab.document.createElement('dd');
		dd.appendChild(requestCommandHTML(request));
		dl.appendChild(dd);
	}
	tab.document.body.appendChild(dl);
}

chrome.browserAction.onClicked.addListener((tab) => {
	if (tab.id == null) {
		console.error('Tab has no ID.');
		return;
	}
	if (tab.id in requestsPerTab) {
		showRequests(requestsPerTab[tab.id]);
		delete requestsPerTab[tab.id];
		updateBrowserAction();
		return;
	}
	requestsPerTab[tab.id] = [];
	updateBrowserAction();
});

chrome.webRequest.onSendHeaders.addListener(handleRequest, {
	urls: ['<all_urls>']
}, ['requestHeaders', 'extraHeaders']);

chrome.tabs.onRemoved.addListener((tabId, _) => delete requestsPerTab[tabId]);

chrome.tabs.onActivated.addListener((_) => updateBrowserAction());

chrome.windows.onFocusChanged.addListener((_) => updateBrowserAction());
