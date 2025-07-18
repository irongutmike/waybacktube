class UserscriptHeader {
    static generate() {
        return `// ==UserScript==
// @name         YouTube Time Machine - Consolidated
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Travel back in time on YouTube - modular build
// @author       Time Traveler
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('[YouTube Time Machine] Starting consolidated userscript...');
`;
    }

    static generateFooter() {
        return `
})();`;
    }
}

module.exports = UserscriptHeader;