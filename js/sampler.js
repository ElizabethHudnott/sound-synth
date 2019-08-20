(function (global) {
'use strict';

const select = document.createElement('select');
select.id = 'recording-device';
let mediaStream, recorder;

const Sampler = {
	devices: select,
	ondatarecorded: undefined,
	recording: false,
	requestAccess: requestAccess,
	startRecording: startRecording,
	stopRecording: stopRecording,
	cancelRecording: cancelRecording,
};

function filterDevices(devices) {
	select.innerHTML = '';
	let option = document.createElement('option');
	option.innerText = 'Default Recording Device';
	option.value = '';
	select.appendChild(option);

	for (let i = 0; i < devices.length; i++) {
		const device = devices[i];
		if (device.kind === 'audioinput') {
			option = document.createElement('option');
			let label = device.label;
			if (label === '') {
				label = 'Device ' + String(i + 1);
			}
			option.innerText = label;
			option.value = device.deviceId;
			select.appendChild(option);
		}
	}
}

if (navigator.mediaDevices) {
	navigator.mediaDevices.enumerateDevices().then(filterDevices);
	navigator.mediaDevices.addEventListener('devicechange', function (event) {
		navigator.mediaDevices.enumerateDevices().then(filterDevices);
	});
}

function stopStream() {
	for (let track of mediaStream.getTracks()) {
		track.stop();
	}
	mediaStream = undefined;
}

function dataAvailable(event) {
	recorder = undefined;
	stopStream();
	const reader = new FileReader();
	reader.onloadend = function (event) {
		audioContext.decodeAudioData(this.result)
		.then(Sampler.ondatarecorded)
	};
	reader.readAsArrayBuffer(event.data);
}

function requestAccess(constraints) {
	if (constraints === undefined) {
		constraints = {};
	}
	const deviceID = select.value;
	if (deviceID === '') {
		constraints.deviceId = undefined;
	} else {
		constraints.deviceId = {exact: deviceID};
	}
	return navigator.mediaDevices.getUserMedia({audio : constraints})
	.then(function (stream) {
		mediaStream = stream;
		recorder = new MediaRecorder(stream);
		recorder.ondataavailable = dataAvailable;
		navigator.mediaDevices.enumerateDevices().then(filterDevices);
	});
}

function startRecording() {
	recorder.start();
	Sampler.recording = true;
}

function stopRecording() {
	recorder.stop();
	Sampler.recording = false;
}

function cancelRecording() {
	recorder.ondataavailable = undefined;
	recorder.stop();
	stopStream();
	Sampler.recording = false;
	recorder = undefined;
}

global.Sampler = Sampler;

})(window);
