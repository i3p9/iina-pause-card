function decodeBase64(value) {
	if (!value) return "";

	try {
		if (typeof Buffer !== "undefined") {
			return Buffer.from(value, "base64").toString("utf8");
		}
	} catch (_error) {}

	try {
		if (typeof atob === "function") {
			return atob(value);
		}
	} catch (_error2) {}

	var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	var clean = String(value || "").replace(/[^A-Za-z0-9+/=]/g, "");
	var output = "";
	var buffer = 0;
	var bits = 0;

	for (var index = 0; index < clean.length; index += 1) {
		var char = clean.charAt(index);
		if (char === "=") break;
		var digit = alphabet.indexOf(char);
		if (digit < 0) continue;
		buffer = (buffer << 6) | digit;
		bits += 6;

		if (bits >= 8) {
			bits -= 8;
			output += String.fromCharCode((buffer >> bits) & 255);
		}
	}

	return output;
}

function getReadToken() {
	return decodeBase64(
		"ZXlKaGJHY2lPaUpJVXpJMU5pSjkuZXlKaGRXUWlPaUl5WmpSalpqaGtORFU1WldWak5UWmlZVEJqTkRVNE1XWmlZMkUwTW1Fd01TSXNJbTVpWmlJNk1UYzNPRFkwTmpVME9TNHhORFVzSW5OMVlpSTZJalpoTURObVpURTFZalV5T1dJNE56azJNVEprTURkbE5TSXNJbk5qYjNCbGN5STZXeUpoY0dsZmNtVmhaQ0pkTENKMlpYSnphVzl1SWpveGZRLlhIcHNnWFN6clBFUEd3bG9IMXhVQ2JLR0xQb1dTbUtFVW0wNGhaQWRtWlk=",
	);
}

module.exports = {
	getReadToken: getReadToken,
};
