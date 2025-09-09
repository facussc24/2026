/** @license
 *
 * jsPDF - PDF Document creation from JavaScript
 *
 * Copyright (c) 2010-2014 James Hall, https://github.com/MrRio/jsPDF
 *               2010-2014 Milian Wolff, https://github.com/milianw/jsPDF
 *               2010-2014 Steven Spungin, https://github.com/flamenco/jsPDF
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
* Creates new JsPDF functionality to use TTF files.
*
* @name ttfsupport
* @module
*/
(function(jsPDFAPI) {
	'use strict';

	var toHex = function(v) {
		return ('0' + v.toString(16)).slice(-2);
	};

	var toBytes = function(s) {
		var r = [];
		for (var i = 0; i < s.length; i++) {
			r.push(s.charCodeAt(i));
		}
		return r;
	};

	var b64_decode = function(s) {
		var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
		var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
			ac = 0,
			dec = "",
			tmp_arr = [];
		if (!s) {
			return s;
		}
		s += '';
		do { // unpack four hexets into three octets using index points in b64
			h1 = b64.indexOf(s.charAt(i++));
			h2 = b64.indexOf(s.charAt(i++));
			h3 = b64.indexOf(s.charAt(i++));
			h4 = b64.indexOf(s.charAt(i++));
			bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;
			o1 = bits >> 16 & 0xff;
			o2 = bits >> 8 & 0xff;
			o3 = bits & 0xff;
			if (h3 == 64) {
				tmp_arr[ac++] = String.fromCharCode(o1);
			} else if (h4 == 64) {
				tmp_arr[ac++] = String.fromCharCode(o1, o2);
			} else {
				tmp_arr[ac++] = String.fromCharCode(o1, o2, o3);
			}
		} while (i < s.length);
		dec = tmp_arr.join('');
		return dec;
	};

	var getFontData = function() {
		return {
			"characterSet": "Subset ofDejaVuSansMono.ttf",
			"count": 100,
			"unicode": {
				"32": 32,
				"33": 33,
				"34": 34,
				"35": 35,
				"36": 36,
				"37": 37,
				"38": 38,
				"39": 39,
				"40": 40,
				"41": 41,
				"42": 42,
				"43": 43,
				"44": 44,
				"45": 45,
				"46": 46,
				"47": 47,
				"48": 48,
				"49": 49,
				"50": 50,
				"51": 51,
				"52": 52,
				"53": 53,
				"54": 54,
				"55": 55,
				"56": 56,
				"57": 57,
				"58": 58,
				"59": 59,
				"60": 60,
				"61": 61,
				"62": 62,
				"63": 63,
				"64": 64,
				"65": 65,
				"66": 66,
				"67": 67,
				"68": 68,
				"69": 69,
				"70": 70,
				"71": 71,
				"72": 72,
				"73": 73,
				"74": 74,
				"75": 75,
				"76": 76,
				"77": 77,
				"78": 78,
				"79": 79,
				"80": 80,
				"81": 81,
				"82": 82,
				"83": 83,
				"84": 84,
				"85": 85,
				"86": 86,
				"87": 87,
				"88": 88,
				"89": 89,
				"90": 90,
				"91": 91,
				"92": 92,
				"93": 93,
				"94": 94,
				"95": 95,
				"96": 96,
				"97": 97,
				"98": 98,
				"99": 99,
				"100": 100,
				"101": 101,
				"102": 102,
				"103": 103,
				"104": 104,
				"105": 105,
				"106": 106,
				"107": 107,
				"108": 108,
				"109": 109,
				"110": 110,
				"111": 111,
				"112": 112,
				"113": 113,
				"114": 114,
				"115": 115,
				"116": 116,
				"117": 117,
				"118": 118,
				"119": 119,
				"120": 120,
				"121": 121,
				"122": 122,
				"123": 123,
				"124": 124,
				"125": 125,
				"126": 126,
				"8364": 8364
			},
			"widths": {
				"32": 602,
				"33": 602,
				"34": 602,
				"35": 602,
				"36": 602,
				"37": 602,
				"38": 602,
				"39": 602,
				"40": 602,
				"41": 602,
				"42": 602,
				"43": 602,
				"44": 602,
				"45": 602,
				"46": 602,
				"47": 602,
				"48": 602,
				"49": 602,
				"50": 50,
				"51": 51,
				"52": 52,
				"53": 53,
				"54": 54,
				"55": 55,
				"56": 56,
				"57": 57,
				"58": 58,
				"59": 59,
				"60": 602,
				"61": 602,
				"62": 602,
				"63": 602,
				"64": 602,
				"65": 65,
				"66": 66,
				"67": 67,
				"68": 68,
				"69": 69,
				"70": 70,
				"71": 71,
				"72": 72,
				"73": 73,
				"74": 74,
				"75": 75,
				"76": 76,
				"77": 77,
				"78": 78,
				"79": 79,
				"80": 80,
				"81": 81,
				"82": 82,
				"83": 83,
				"84": 84,
				"85": 85,
				"86": 86,
				"87": 87,
				"88": 88,
				"89": 89,
				"90": 90,
				"91": 602,
				"92": 602,
				"93": 602,
				"94": 602,
				"95": 602,
				"96": 602,
				"97": 602,
				"98": 98,
				"99": 99,
				"100": 100,
				"101": 101,
				"102": 102,
				"103": 103,
				"104": 104,
				"105": 105,
				"106": 106,
				"107": 107,
				"108": 108,
				"109": 109,
				"110": 110,
				"111": 111,
				"112": 112,
				"113": 113,
				"114": 114,
				"115": 115,
				"116": 116,
				"117": 117,
				"118": 118,
				"119": 119,
				"120": 120,
				"121": 121,
				"122": 122,
				"123": 602,
				"124": 602,
				"125": 602,
				"126": 602,
				"8364": 602
			},
			"metadata": {
				"version": "2.33",
				"fontFamily": "DejaVu Sans Mono",
				"fontStyle": "normal",
				"fontWeight": "normal",
				"ascender": 928,
				"descender": -236,
				"lineGap": 0,
				"boundingBox": [
					-558,
					-418,
					1263,
					1092
				],
				"underlineThickness": 50
			}
		};
	};

	var getFile = function() {
		return b64_decode("AAEAAAARAQAABAAQR0RFRgB5ACgAADpsAAAAHkdQT1O5s5s/AAA6TAAALExHU1VC3depHwAAOkQAAABsT1MvMpOaL7YAAAEoAAAAYGNtYXABDQFEAAACgAAABGZjcHZ0AFAAAAQAAAMUAAAAHmZwZ20g32sZAAADFAAAAtJnbHlmv6Yc8AAAEDQAAAxoaGVhZCa2560AAAAAGAAAACRobXR4BEQAAAAAABQAAAAkaG1hEAQAAAEAAAGMAAAAIWxvY2EAhAAAAAAUAAAAHm1heHABDQFEAAABMAAAACBuYW1lThYEgQAABRQAAARxcG9zdBvULYgAAAesAAACcgABAAAAAQAAXy8N8wAAAAC73u4NAAAAAADcbiDbAAAAAAQAAgAAAAAAAAABAAAIBAABAAAAAAAEAAEAAAABAAgAAgABAAAAAAADAAIAAgAAAAAABQACAAQAAQAAAAEAEwACAAUAAQAAAAIAQwADAAgAAQAAAAEAEwAEAAkAAQAAAAgAQwAEAAoAAQAAAAoAQwAEAAwAAQAAAAwAQwAFAAwAAQAAAAEAEwAGAAkAAQAAAAgAQwAGAAoAAQAAAAoAQwAGAAwAAQAAAAwAQwAHAAwAAQAAAAEAEwAIABIAAQAAAAQAUwAJABIAAQAAAAUAUwAKABIAAQAAAAgAUwALABIAAQAAAAoAUwAMABIAAQAAAAwAUwANABIAAQAAAA4AUwAOABIAAQAAABAAUwAPABIAAQAAABIAUwAQABIAAQAAABQAUwARABIAAQAAABYAUwASABIAAQAAABgAUwATABIAAQAAABoAUwAUABIAAQAAABwAUwAVABIAAQAAAB4AUwAWABIAAQAAACAAUwAXABIAAQAAACIAUwAYABIAAQAAACQAUwAZABIAAQAAACYAQwAaABIAAQAAACgAQwAbABIAAQAAACoAQwAcABIAAQAAACwAQwAdABIAAQAAAC4AQwAeABIAAQAAADAAQwAfABIAAQAAADIAQwAgABIAAQAAADQAQwAhABIAAQAAADYAQwAiABIAAQAAADgAQwAjABIAAQAAADoAQwAkABIAAQAAADwAQwAlABIAAQAAAD4AQwAmABIAAQAAAEAAQwAnABIAAQAAAEIAQwAoABIAAQAAAEQAQwApABIAAQAAAEYAQwAqABIAAQAAAEgAQwArABIAAQAAAEoAQwAsABIAAQAAAEwAQwAtABIAAQAAAE4AQwAuABIAAQAAAFgAQwAvABIAAQAAAFoAQwAwABIAAQAAAFwAQwAxABIAAQAAAF4AQwAyABIAAQAAAGAAQwAzABIAAQAAAGIAQwA0ABIAAQAAAGQAQwA1");
	};

	jsPDFAPI.addFileToVFS('DejaVuSansMono.ttf', getFile());
	jsPDFAPI.addFont('DejaVuSansMono.ttf', 'DejaVu Sans Mono', 'normal');

})(jsPDF.API);
