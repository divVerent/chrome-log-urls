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

function shellEscape(str: string): string {
	return `'${str.replace(/'/g, "'\\''")}'`;
}

function requestCommand(details: chrome.webRequest.WebRequestHeadersDetails): string {
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
	curlCommand += shellEscape(details.url);
	return curlCommand;
}

function escapeHTML(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function requestCommandHTML(details: chrome.webRequest.WebRequestHeadersDetails): string {
	return '<dt>' + escapeHTML(details.type) + '</dt><dd>' + escapeHTML(requestCommand(details)) + '</dd>';
}

function updateBrowserAction() {
	chrome.tabs.query({
		'active': true,
		'currentWindow': true
	}, (tabs) => {
		if (tabs.length != 1) {
			return;
		}
		const tabIdVal = tabs[0].id;
		if (tabIdVal == null) {
			console.error('Active tab has no ID.');
			return;
		}
		const tabId = tabIdVal.toString();
		chrome.storage.session.get([tabId]).then((result) => {
			const requests = result[tabId];
			chrome.action.setBadgeText({
				text: requests ? (requests.split('\n').length-1).toString() : ''
			});
		});
	});
}

function handleRequest(details: chrome.webRequest.WebRequestHeadersDetails) {
	const cmd = requestCommandHTML(details);
	const tabId = details.tabId.toString();
	chrome.storage.session.get([tabId]).then((result) => {
		if (!(tabId in result)) {
			return;
		}
		result[tabId] += cmd;
		result[tabId] += "\n";
		chrome.storage.session.set(result).then(() => updateBrowserAction());
	});
}

function showRequests(requests: string) {
	const html = '<!DOCTYPE html><title>chrome-log-urls</title><dl>' + requests + '</dl>';
	chrome.tabs.create({
		'active': true,
		'url': 'data:text/html;base64,' + btoa(html)
	});
}

chrome.action.onClicked.addListener((tab) => {
	if (tab.id == null) {
		console.error('Tab has no ID.');
		return;
	}
	const tabId = tab.id.toString();
	chrome.storage.session.get([tabId]).then((result) => {
		if (!(tabId in result)) {
			chrome.storage.session.set({[tabId]: ""}).then(() => updateBrowserAction());
			return;
		}
		showRequests(result[tabId]);
		chrome.storage.session.remove([tabId]).then(() => updateBrowserAction());
	});
});

const options = ['requestHeaders'];
declare var browser: any;
if (typeof browser === undefined) {
	options.push('extraHeaders');
}
chrome.webRequest.onSendHeaders.addListener(handleRequest, {
	urls: ['<all_urls>']
}, options);

chrome.tabs.onRemoved.addListener((tabId, _) => {
	chrome.storage.session.remove(tabId.toString()).then(() => {});
});

chrome.tabs.onActivated.addListener((_) => updateBrowserAction());

chrome.windows.onFocusChanged.addListener((_) => updateBrowserAction());
