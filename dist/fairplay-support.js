function stringToArray(string) {
    var buffer = new ArrayBuffer(string.length*2); // 2 bytes for each char
    var array = new Uint16Array(buffer);
    for (var i=0, strLen=string.length; i<strLen; i++) {
        array[i] = string.charCodeAt(i);
    }
    return array;
}

function arrayToString(array) {
    var uint16array = new Uint16Array(array.buffer);
    return String.fromCharCode.apply(null, uint16array);
}

function base64DecodeUint8Array(input) {
    var raw = window.atob(input);
    var rawLength = raw.length;
    var array = new Uint8Array(new ArrayBuffer(rawLength));

    for(i = 0; i < rawLength; i++)
        array[i] = raw.charCodeAt(i);

    return array;
}

function base64EncodeUint8Array(input) {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0;

    while (i < input.length) {
        chr1 = input[i++];
        chr2 = i < input.length ? input[i++] : Number.NaN; 
        chr3 = i < input.length ? input[i++] : Number.NaN; 

        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;

        if (isNaN(chr2)) {
            enc3 = enc4 = 64;
        } else if (isNaN(chr3)) {
            enc4 = 64;
        }
        output += keyStr.charAt(enc1) + keyStr.charAt(enc2) +
            keyStr.charAt(enc3) + keyStr.charAt(enc4);
    }
    return output;
}

function waitForEvent(name, action, target) {
    target.addEventListener(name, function() {
        action(arguments[0]);
    }, false);
}

var pallyCon = {
    keySystem: null,
    certificate: null,
    player: null,
    contentUrl: null,
    contentId: null,
    licenseUrl: null,
    pallyconCustomData: null,
    fairplay: function(option){
        if(option.player !== undefined){
            pallyCon.player = option.player;
        }
        if(option.content_url !== undefined){
            pallyCon.contentUrl = option.content_url;
        }
        if(option.pallycon_custom_data !== undefined){
            pallyCon.pallyconCustomData = option.pallycon_custom_data;
        }
        if(option.license_url !== undefined){
            pallyCon.licenseUrl = option.license_url;
        }
        var request = new XMLHttpRequest();
        //request.responseType = 'arraybuffer';
        request.responseType = 'text';
        request.addEventListener('load', pallyCon.onCertificateLoaded, false);
        request.addEventListener('error', pallyCon.onCertificateError, false);
        request.open('GET', option.certificate_uri, true);
        request.setRequestHeader('Pragma', 'Cache-Control: no-cache');
        request.setRequestHeader("Cache-Control", "max-age=0");
        request.send();
    },
    onCertificateLoaded: function(event){
        var request = event.target;
        console.log("request.response =>" + request.response);
        console.log("request.response length=>" + request.response.length);
        console.log("request.response type =>" + typeof request.response);
        //console.log("request.response to String =>" + String.fromCharCode.apply(null, new Uint8Array(request.response)));
        pallyCon.certificate = base64DecodeUint8Array(request.response);
        //certificate = new Uint8Array(request.response);
        pallyCon.player.src({
            'src': pallyCon.contentUrl,
        });
        pallyCon.player.tech_.el_.addEventListener('webkitneedkey', pallyCon.onNeedKey, false);
        pallyCon.player.tech_.el_.addEventListener('error', pallyCon.onError, false);
    },
    onCertificateError: function(event) {
        window.console.error('Failed to retrieve the server certificate.');
    },
	extractContentId: function(initData) {
		pallyCon.contentId = arrayToString(initData);
		pallyCon.contentId = pallyCon.contentId.substring(pallyCon.contentId.indexOf('skd://')+6);
		return pallyCon.contentId;
	},
    concatInitDataIdAndCertificate: function(initData, id, cert) {
        if (typeof id == "string")
            id = stringToArray(id);
        // layout is [initData][4 byte: idLength][idLength byte: id][4 byte:certLength][certLength byte: cert]
        var offset = 0;
        //var buffer = new ArrayBuffer(initData.byteLength + 4 + id.byteLength + 4 + cert.byteLength);
        var buffer = new ArrayBuffer(initData.byteLength + 4 + id.byteLength + 4 + cert.byteLength);
        var dataView = new DataView(buffer);

        var initDataArray = new Uint8Array(buffer, offset, initData.byteLength);
        initDataArray.set(initData);
        offset += initData.byteLength;

        dataView.setUint32(offset, id.byteLength, true);
        offset += 4;

        var idArray = new Uint16Array(buffer, offset, id.length);
        idArray.set(id);
        offset += idArray.byteLength;

        dataView.setUint32(offset, cert.byteLength, true);
        offset += 4;

        var certArray = new Uint8Array(buffer, offset, cert.byteLength);
        certArray.set(cert);

        return new Uint8Array(buffer, 0, buffer.byteLength);
    },
    selectKeySystem : function(){
        if (WebKitMediaKeys.isTypeSupported("com.apple.fps.1_0", "video/mp4"))
        {
            pallyCon.keySystem = "com.apple.fps.1_0";
        }
        else
        {
            throw "Key System not supported";
        }
    },
    onError: function(event){
        window.console.error('A video playback error occurred');
    },
    onNeedKey: function(event) {
        var video = event.target;
        var initData = event.initData;
        var contentId = pallyCon.extractContentId(initData);
        initData = pallyCon.concatInitDataIdAndCertificate(initData, contentId, pallyCon.certificate);
        if (!video.webkitKeys)
        {
            pallyCon.selectKeySystem();
            video.webkitSetMediaKeys(new WebKitMediaKeys(pallyCon.keySystem));
        }

        if (!video.webkitKeys)
            throw "Could not create MediaKeys";

        var keySession = video.webkitKeys.createSession("video/mp4", initData);
        if (!keySession)
            throw "Could not create key session";

        keySession.contentId = contentId;
        waitForEvent('webkitkeymessage', pallyCon.licenseRequestReady, keySession);
        waitForEvent('webkitkeyadded', pallyCon.onKeyAdded, keySession);
        waitForEvent('webkitkeyerror', pallyCon.onKeyError, keySession);
    },
    licenseRequestReady: function(event){
        var session = event.target;
        var message = event.message;
        var request = new XMLHttpRequest();
        var sessionId = event.sessionId;
        request.responseType = 'text';
        request.session = session;
        request.addEventListener('load', pallyCon.licenseRequestLoaded, false);
        request.addEventListener('error', pallyCon.licenseRequestFailed, false);
        console.log("spc=" + base64EncodeUint8Array(message));
        var params = 'spc='+base64EncodeUint8Array(message)+'&assetId='+encodeURIComponent(session.contentId);
        request.open('POST', pallyCon.licenseUrl, true);
        request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
        //pallycon add
        request.setRequestHeader("pallycon-customdata-v2", pallyCon.pallyconCustomData);
        request.send(params);
    },
    licenseRequestLoaded : function(event) {
        var request = event.target;
        var session = request.session;
        // response can be of the form: '\n<ckc>base64encoded</ckc>\n'
        // so trim the excess:
        var keyText = request.responseText.trim();
        keyText = base64DecodeUint8Array(keyText);
        session.update(keyText);
    },
    licenseRequestFailed :  function(event) {
        window.console.error('The license request failed.');
    },
    onKeyError: function(event) {
        window.console.error('A decryption key error was encountered');
    },
    onKeyAdded: function(event) {
        window.console.log('Decryption key was added to session.');
    }
};


