"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
function checkFileIsExpired(date) {
    if (date) {
        return new Date(date).getTime() < new Date().getTime();
    }
    return false;
}
const handler = async (event, _context, callback) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;
    const expiresSrc = 'Expires';
    const cacheControlSrc = 'Cache-Control';
    try {
        // Check if file is expired
        if (headers[expiresSrc.toLowerCase()] && checkFileIsExpired(headers[expiresSrc.toLowerCase()][0].value)) {
            headers[cacheControlSrc.toLowerCase()] = [{ key: cacheControlSrc, value: 'no-cache' }];
        }
        callback(null, response);
    }
    catch (_e) {
        const error = _e;
        callback(null, {
            status: '500',
            statusDescription: 'Internal Server Error',
            body: `Error: ${error.message}`
        });
    }
};
exports.handler = handler;
