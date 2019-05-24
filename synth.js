(function (global) {
'use strict';

const SEMITONE = 2 ** (1 / 12);
const CENT = 2 ** (1 / 1200);

const LFO_MAX = 20;
const TIME_STEP = 0.02; // 50 steps per second

function calculateParameterValue(change, currentValue) {
	if (change === undefined) {
		return currentValue;
	}
	switch (change.type) {
	case ChangeType.DELTA:
		return currentValue + change.value;
	case ChangeType.MULTIPLY:
		return currentValue * change.value;
	default:
		return change.value;
	}
}

function clamp(value) {
	if (value > LFO_MAX) {
		return LFO_MAX;
	} else if (value < -LFO_MAX) {
		return -LFO_MAX;
	} else {
		return value;
	}
}

function volumeCurve(value) {
	if (value === 0) {
		return 0;
	} else {
		return 10 ** (-1 * (100 - value) / 99);
	}
}

function inverseVolumeCurve(value) {
	if (value === 0) {
		return 0;
	} else {
		return 100 + 99 * Math.log10(value);
	}
}

function enumFromArray(array) {
	const result = {};
	for (let i = 0; i < array.length; i++) {
		result[array[i]] = i;
	}
	return Object.freeze(result);
}

const Parameter = enumFromArray([
	'VELOCITY',		// percentage
	'ATTACK',		// in milliseconds
	'ATTACK_CURVE', // 0.5 = linear approximation, 3 = good exponential choice
	'HOLD',			// in milliseconds
	'DECAY',		// in milliseconds
	'DECAY_SHAPE',	// ChangeType.LINEAR or ChangeType.EXPONENTIAL
	'SUSTAIN',		// percentage
	'RELEASE',		// in milliseconds
	'RELEASE_SHAPE', // ChangeType.LINEAR or ChangeType.EXPONENTIAL
	'DURATION',		// in milliseconds (0 = auto)
	'GATE',			// CLOSED, OPEN, TRIGGER, CUT, REOPEN or RETRIGGER
	'WAVEFORM',		// combinations of Waveform enum values
	'FREQUENCY',	// in hertz
	'DETUNE',		// in cents
	'NOTES',		// MIDI note number
	'TUNING_STRETCH', // in cents
	'LFO1_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO1_RATE',	// in hertz
	'LFO1_GAIN',	// -100 to 100
	'LFO1_DELAY',	// in milliseconds
	'LFO1_ATTACK',	// in milliseconds
	'LFO1_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO1_FADE', // one of the Direction enums
	'LFO1_RETRIGGER', // 0 or 1
	'LFO2_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO2_RATE',	// in hertz
	'LFO2_MIN_RATE', // in hertz
	'LFO2_MAX_RATE', // in hertz
	'LFO2_GAIN',	// -100 to 100
	'LFO2_DELAY',	// in milliseconds
	'LFO2_ATTACK',	// in milliseconds
	'LFO2_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO2_FADE', // one of the Direction enums
	'LFO2_RETRIGGER', // 0 or 1
	'LFO3_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO3_RATE',	// in hertz
	'LFO3_GAIN',	// -100 to 100
	'LFO3_DELAY',	// in milliseconds
	'LFO3_ATTACK',	// in milliseconds
	'LFO3_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO3_FADE', // one of the Direction enums
	'LFO3_RETRIGGER', // 0 or 1
	'VIBRATO_LFO',	// which LFO to use
	'VIBRATO_EXTENT', // in cents
	'SIREN_EXTENT',	// in semitones
	'VOLUME',		// percentage
	'TREMOLO_LFO',	// which LFO to use
	'TREMOLO_DEPTH', // percentage
	'PAN',			// -100 to 100
	'LEFTMOST_PAN',	// -100 to 100
	'RIGHTMOST_PAN', // -100 to 100
	'PAN_LFO',		// which LFO to use
	'SOURCE',		// 0 (oscillator) to 100 (samples)
	'PULSE_WIDTH',	// percentage
	'MIN_PULSE_WIDTH', // percentage
	'MAX_PULSE_WIDTH', // percentage
	'PWM_LFO',		// which LFO to use
	'FILTER_TYPE',	// 'lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf' or 'peaking'
	'FILTER_FREQUENCY', // in hertz
	'MIN_FILTER_FREQUENCY', // in hertz
	'MAX_FILTER_FREQUENCY', // in hertz
	'Q',			// 0.0001 to 1000
	'MIN_Q',		// 0.0001 to 1000
	'MAX_Q',		// 0.0001 to 1000
	'FILTER_LFO',	// which LFO to use
	'FILTER_GAIN',	// -40dB to 40dB
	'FILTER_MIX', // percentage (may be more than 100)
	'UNFILTERED_MIX', // percentage
	'DELAY',		// milliseconds
	'MIN_DELAY',	// milliseconds
	'MAX_DELAY',	// milliseconds
	'DELAY_LFO',	// which LFO to use
	'DELAY_MIX',	// percentage (may be more than 100)
	'FEEDBACK',		// percentage
	'RING_MOD', // 0 to 100
	'SYNC',			// 0 or 1
	'LINE_TIME',	// in steps
	'TICKS',		// maximum number of events during a LINE_TIME
	'PATTERN_DELAY', // amount of time to delay the pattern by (in multiples of the line time)
	'DELAY_TICKS',	// amount of time to delay the channel by (in ticks)
	'RETRIGGER',	// number of ticks between retriggers
	'MULTI_TRIGGER', // 0 or 1 (for chords)
	'RETRIGGER_VOLUME', // percentage of original note volume
	'CHORD_SPEED',	// number of ticks between notes of a broken chord
	'CHORD_PATTERN', // A value from the Pattern enum
	'GLISSANDO_SIZE', // number of steps
	'SAMPLE',		// array index of the sample to play.
	'SAMPLE_OFFSET', // in seconds
	'SCALE_AHD',	// dimensionless (-1 or more)
	'LOOP_START',	// anything (presence of the parameter is all that matters)
	'LOOPS',			// a positive integer
]);

const ChangeType = Object.freeze({
	SET: 'setValueAtTime',
	LINEAR: 'linearRampToValueAtTime',
	EXPONENTIAL: 'exponentialRampToValueAtTime',
	DELTA: '+',		//standalone or prefixed before LINEAR or EXPONENTIAL
	MULTIPLY: '*',	//standalone or prefixed before LINEAR or EXPONENTIAL
	MARK: '=',
});

class Change {
	constructor(type, value) {
		this.type = type;
		this.value = value;
	}

	equals(obj) {
		if (obj === undefined) {
			return false;
		} else {
			return this.type === obj.type && this.value === obj.value;
		}
	}

	static Mark = new Change(ChangeType.SET, 1);
}

/**
 * 1 do release phase
 * 2 do attack, hold and decay phases
 * 4 don't start from 0 (retrigger off)
 */
const Gate = Object.freeze({
	CUT: 0,
	CLOSED: 5,
	OPEN: 2,
	TRIGGER: 3,
	REOPEN: 6,
	MULTI_TRIGGER: 7,
	MULTI_TRIGGERABLE: 4, // add to OPEN or TRIGGER
});

const Waveform = Object.freeze({
	POP: 0,
	TRIANGLE: 1,
	SAWTOOTH: 2,
	PULSE: 4,
	NOISE: 8,
});

const Source = Object.freeze({
	OSCILLATOR: 0,
	SAMPLE: 100,
});

const Chord = Object.freeze({
	CYCLE: 0,
	TO_AND_FRO: 1,
	TO_AND_FRO_2: 2,
	RANDOM: 3,
});

const Direction = Object.freeze({
	UP: 1,
	DOWN: -1,
});

class LFO {
	constructor(audioContext) {
		this.audioContext = audioContext;
		const oscillator = audioContext.createOscillator();
		this.oscillator = oscillator;
		oscillator.frequency.value = 5;
		this.frequency = 5;

		const delayNode = audioContext.createDelay();
		this.delayNode = delayNode;

		const envelope = audioContext.createGain();
		this.envelope  = envelope;
		delayNode.connect(envelope);
		oscillator.connect(envelope);

		this.gain = 1;
		this.delay = 0;
		this.attack = 0;
		this.rateMod = 1;
		this.fadeDirection = Direction.UP;
		this.retrigger = 0; // i.e. false
		this.zeroPoint = undefined;
	}

	start(when) {
		this.oscillator.start(when);
		this.zeroPoint = when;
	}

	setFrequency(changeType, frequency, time) {
		if (this.retrigger) {
			const period = 1 / this.frequency;
			const phase = (time - this.zeroPoint) % period;
			time = time + period - phase;
			this.zeroPoint = time;
			changeType = ChangeType.SET;
		}
		const param = this.oscillator.frequency;
		param.cancelAndHoldAtTime(time);
		param[changeType](frequency, time);
		this.frequency = frequency;
	}

	setRetrigger(value, time) {
		if (value && !this.retrigger) {
			const oldOscillator = this.oscillator;
			oldOscillator.stop(time);
			const newOscillator = this.audioContext.createOscillator();
			this.oscillator = newOscillator;
			newOscillator.frequency.value = this.frequency;
			newOscillator.start(time);
			newOscillator.connect(this.delayNode);
			this.zeroPoint = time;
			this.rateMod = 1;

			const callbackDelay = Math.trunc((time - this.audioContext.currentTime) * 1000) + 1;
			const me = this;
			setTimeout(function () {
				oldOscillator.disconnect();
			}, callbackDelay);
		}
		this.retrigger = value;
	}

	trigger(when) {
		const gain = this.envelope.gain;
		gain.cancelAndHoldAtTime(when);

		const endDelay = when + this.delay;
		const endAttack = endDelay + this.attack;

		if (this.retrigger) {
			const period = 1 / this.frequency;
			const phase = (when - this.zeroPoint) % period;
			this.delayNode.delayTime.setValueAtTime(phase, when);
		}

		if (endAttack === when) {
			gain.setValueAtTime(this.gain, when);
		} else {
			let startValue, endValue;
			if (this.fadeDirection === Direction.UP) {
				startValue =  0;
				endValue = this.gain;
			} else {
				startValue = this.gain;
				endValue = 0;
			}

			gain.setValueAtTime(startValue, when);
			gain.setValueAtTime(startValue, endDelay);
			gain.linearRampToValueAtTime(endValue, endAttack);

			if (this.rateMod !== 1) {
				const frequency = this.oscillator.frequency;
				frequency.cancelAndHoldAtTime(when);
				let startRate, endRate;
				if (this.fadeDirection === Direction.UP) {
					endRate = this.frequency;
					startRate = endRate * this.rateMod;
				} else {
					startRate = this.frequency;
					endRate = startRate * this.rateMod;
				}
				frequency.setValueAtTime(startRate, when);
				frequency.setValueAtTime(startRate, endDelay);
				frequency.linearRampToValueAtTime(endRate, endAttack);
			}
		}
	}

	connect(destination) {
		this.envelope.connect(destination.range);
		destination.lfo = this;
	}

	disconnect(destination) {
		this.envelope.disconnect(destination.range);
	}

}

class Modulator {
	constructor(audioContext, lfo, carrier) {
		this.lfo = lfo;
		this.carriers = [carrier];
		const range = audioContext.createGain();
		this.range = range;
		range.gain.value = 0;
		lfo.connect(this);
		range.connect(carrier);
	}

	setMinMax(changeType, min, max, time) {
		const multiplier = (max - min) / 2;
		const centre = min + multiplier;
		this.range.gain[changeType](multiplier, time);

		for (let carrier of this.carriers) {
			carrier[changeType](centre, time);
		}
	}

	setRange(changeType, range, time) {
		this.range.gain[changeType](range / 2, time);
	}

	setCentre(changeType, centre, time) {
		for (let carrier of this.carriers) {
			carrier[changeType](centre, time);
		}
	}

	connect(carrier) {
		this.range.connect(carrier);
		const carriers = this.carriers;
		if (!carriers.includes(carrier)) {
			if (carriers.length > 0) {
				carrier.value = carriers[0].value;
			}
			this.carriers.push(carrier);
		}
	}

	disconnect() {
		this.lfo.disconnect(this);
	}

	cancelAndHoldAtTime(when) {
		this.range.gain.cancelAndHoldAtTime(when);
		for (let carrier of this.carriers) {
			carrier.cancelAndHoldAtTime(when);
		}
	}

}

const noteFrequencies = [];
for (let i = 0; i <= 127; i++) {
	noteFrequencies[i] = 2 ** ((i - 69) / 12) * 440;
}

class Sample {
	static EMPTY_BUFFER = new AudioBuffer({length: 1, sampleRate: 8000});
	static EMPTY_SAMPLE = new Sample(Sample.EMPTY_BUFFER);

	constructor(buffer) {
		this.buffer = buffer;
		this.loopStart = 0;
		this.loopEnd = Number.MAX_VALUE;
		this.sampledNote = 69;
	}

	clone() {
		const newSample = new Sample(Sample.EMPTY_BUFFER);
		const oldBuffer = this.buffer;
		const numberOfChannels = oldBuffer.numberOfChannels;
		const newBuffer = new AudioBuffer({
			length: oldBuffer.length,
			numberOfChannels: numberOfChannels,
			sampleRate: oldBuffer.sampleRate,
		});
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			newBuffer.copyToChannel(oldBuffer.getChannelData(channelNumber), channelNumber);
		}
		newSample.buffer = newBuffer;
		newSample.loopStart = this.loopStart;
		newSample.loopEnd = this.loopEnd;
		newSample.sampledNote = this.sampledNote;
		return newSample;
	}

	reverse() {
		for (let channelNumber = 0; channelNumber < this.buffer.numberOfChannels; channelNumber++) {
			const channelData = this.buffer.getChannelData(channelNumber);
			channelData.reverse();
		}
	}

	pingPong() {
		const oldBuffer = this.buffer;
		const oldLength = oldBuffer.length;
		const newLength = oldLength * 2;
		const newBuffer = new AudioBuffer({
			length: newLength,
			numberOfChannels: oldBuffer.numberOfChannels,
			sampleRate: oldBuffer.sampleRate,
		});
		for (let channelNumber = 0; channelNumber < oldBuffer.numberOfChannels; channelNumber++) {
			newBuffer.copyToChannel(oldBuffer.getChannelData(channelNumber), channelNumber);
			const channelData = newBuffer.getChannelData(channelNumber);
			for (let i = 0; i < oldLength; i++) {
				channelData[newLength - i - 1] = channelData[i];
			}
		}
		const newSample = new Sample(newBuffer);
		newSample.loopStart = this.loopStart;
		newSample.loopEnd = this.loopEnd;
		newSample.sampledNote = this.sampledNote;
		return newSample;
	}

	get amplitude() {
		const buffer = this.buffer;
		const length = buffer.length;
		let max = 0;
		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			for (let i = 0; i < length; i++) {
				const value = data[i];
				if (value > max) {
					max = value;
				} else if (value < -max) {
					max = -value;
				}
			}
		}
		return max;
	}

	removeOffset() {
		const buffer = this.buffer;
		const length = buffer.length;
		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			let offset = 0;
			for (let i = 0; i < length; i++) {
				offset = offset + data[i] / length;
			}
			for (let i = 0; i < length; i++) {
				data[i] = data[i] - offset;
			}
		}
	}

	amplify(gain) {
		const buffer = this.buffer;
		const length = buffer.length;
		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			for (let i = 0; i < length; i++) {
				data[i] = data[i] * gain;
			}
		}
	}

	chord(notes, instrumentNoteFreqs) {
		const numNotes = notes.length;
		const frequencyRatio = instrumentNoteFreqs[notes[0]] / noteFrequencies[this.sampledNote];
		const rates = [1];
		for (let i = 1; i < numNotes; i++) {
			rates[i] = instrumentNoteFreqs[notes[i]] / frequencyRatio;
		}
		const oldBuffer = this.buffer;
		const length = oldBuffer.length;
		const numChannels = oldBuffer.numberOfChannels;
		const newBuffer = new AudioBuffer({
			length: length,
			numberOfChannels: numChannels,
			sampleRate: oldBuffer.sampleRate * frequencyRatio,
		});
		for (let channelNumber = 0; channelNumber < numChannels; channelNumber++) {
			const oldData = oldBuffer.getChannelData(channelNumber);
			const newData = newBuffer.getChannelData(channelNumber);
			for (let outputPosition = 0; outputPosition < length; outputPosition++) {
				let outputValue = 0;
				for (let rate of rates) {
					const position = outputPosition * rate;
					if (position <= length - 1) {
						const lowerPosition = Math.trunc(position);
						const upperPosition = Math.ceil(position);
						const upperFraction = position - lowerPosition;
						const noteValue = oldData[lowerPosition] * (1 - upperFraction) + oldData[upperPosition] * upperFraction;
						outputValue += noteValue;
					}
				}
				newData[outputPosition] = outputValue;
			}
		}
		const newSample = new Sample(newBuffer);
		newSample.loopStart = this.loopStart;
		newSample.loopEnd = this.loopEnd;
		newSample.sampledNote = this.sampledNote;
		return newSample;
	}

}

class SamplePlayer {
	constructor(audioContext, sample, loop) {
		const bufferNode = audioContext.createBufferSource();
		this.bufferNode = bufferNode;
		bufferNode.buffer = sample.buffer;
		bufferNode.playbackRate.value = 0;
		if (loop) {
			bufferNode.loop = true;
			bufferNode.loopStart = sample.loopStart;
			bufferNode.loopEnd = sample.loopEnd;
		}
		this.samplePeriod = 1 / noteFrequencies[sample.sampledNote];
	}
}

class SampledInstrument {

	constructor() {
		this.samples = [];
		this.startingNotes = [];
		this.loop = false;
	}

	addSample(startingNote, sample, preserveDetails) {
		let i = 0;
		for (i = 0; i < this.startingNotes.length; i++) {
			const currentNote = this.startingNotes[i];
			if (currentNote === startingNote) {
				if (preserveDetails) {
					this.samples[i].buffer = sample.buffer;
				} else {
					this.samples[i] = sample;
				}
				return;
			} else if (currentNote > startingNote) {
				break;
			}
		}
		this.samples.splice(i, 0, sample);
		this.startingNotes.splice(i, 0, startingNote);
	}

	removeSample(index) {
		this.samples.splice(index, 1);
		this.startingNotes.splice(index, 1);
	}

	getSamplePlayer(audioContext, note) {
		let i = this.startingNotes.length;
		if (i === 0) {
			return new SamplePlayer(audioContext, Sample.EMPTY_SAMPLE, false);
		}
		for (; i > 0; i--) {
			if (this.startingNotes[i] <= note) {
				break;
			}
		}
		return new SamplePlayer(audioContext, this.samples[i], this.loop);
	}

	reverse() {
		for (let sample of this.samples) {
			sample.reverse();
		}
	}

	pingPong() {
		for (let i = 0; i < this.samples.length; i++) {
			this.samples[i] = this.samples[i].pingPong();
		}
	}

	normalize() {
		let max = 0;
		for (let sample of this.samples) {
			sample.removeOffset();
			const amplitude = sample.amplitude;
			if (amplitude > max) {
				max = amplitude;
			}
		}
		for (let sample of this.samples) {
			sample.amplify(1 / max);
		}
	}

	loadSampleFromURL(audioContext, startingNote, url, callback) {
		const sample = new Sample(Sample.EMPTY_BUFFER);
		this.addSample(startingNote, sample, true);
		const request = new XMLHttpRequest();
		request.open('GET', url);
		request.responseType = 'arraybuffer';
		request.timeout = 60000;

		request.addEventListener('load', function (event) {
	  		if (request.status < 400) {
	  			const arr = request.response;
	  			const arrCopy = arr.slice(0);
		  		audioContext.decodeAudioData(arr)
		  		.then(function(buffer) {
		  			sample.buffer = buffer;
		  			callback(url, true, '');

		  		}).catch(function (error) {
		  			sample.buffer = decodeSampleData(arrCopy);
		  			callback(url, true, '');
		  		});
		  	} else {
		  		callback(url, false, request.status + ' - ' + request.statusText);
		  	}
	  	});

		request.addEventListener('error', function (event) {
			callback(url, false,'Network error');
		});

		request.addEventListener('timeout', function (event) {
			dispatchError(url, false, 'Timeout');
		});

	 	request.send();
	 	return sample;
	}

	loadSampleFromFile(audioContext, startingNote, file, callback) {
		const sample = new Sample(Sample.EMPTY_BUFFER);
		this.addSample(startingNote, sample, true);
		const reader = new FileReader();
		reader.onloadend = function (event) {
			const arr = event.target.result;
			const arrCopy = arr.slice(0);
	  		audioContext.decodeAudioData(arr)
	  		.then(function(buffer) {
	  			sample.buffer = buffer;
	  			callback(file);

	  		}).catch(function (error) {
	  			sample.buffer = decodeSampleData(arrCopy);
	  			callback(file);
	  		});
		};
		reader.readAsArrayBuffer(file);
		return sample;
	}

}

class SynthSystem {
	constructor(audioContext, callback) {
		const me = this;
		this.audioContext = audioContext;
		this.channels = [];
		this.globalParameters = [
			24,	// LINE_TIME
			12,	// TICKS
		];
		this.startTime = audioContext.currentTime; // dummy value overridden by start()

		this._a4Pitch = 440;
		this.tunings = new Map();
		this.sampledInstruments = [];

		const volume = audioContext.createGain();
		this.volume = volume;
		volume.connect(audioContext.destination);

		const outputStreamNode = audioContext.createMediaStreamDestination();
		this.outputStreamNode = outputStreamNode;
		this.appendRecording = false;
		this.ondatarecorded = undefined;
		this.setRecordingFormat(undefined, undefined);

		audioContext.audioWorklet.addModule('audioworkletprocessors.js').then(function () {
			if (callback !== undefined) {
				callback(me);
			}
		});
	}

	addChannel(channel, output) {
		output.connect(this.volume);
		output.connect(this.outputStreamNode);
		this.channels.push(channel);
	}

	get a4Pitch() {
		return this._a4Pitch;
	}

	set a4Pitch(a4Pitch) {
		const tunings = this.tunings;
		tunings.clear();
		for (let channel of this.channels) {
			const stretch = channel.parameters[Parameter.TUNING_STRETCH];
			let channelNotes = tunings.get(stretch);
			if (channelNotes === undefined) {
				channelNotes = new Array(127);
				const s = 1 + stretch / 100;
				for (let i = 0; i <= 127; i++) {
					channelNotes[i] = 2 ** ((i - 69) * s / 12) * a4Pitch;
				}
				tunings.set(stretch, channelNotes);
			}
			channel.noteFrequencies = channelNotes;
		}
		this._a4Pitch = a4Pitch;
	}

	getNotes(stretch) {
		const a4Pitch = this._a4Pitch;
		let channelNotes = this.tunings.get(stretch);
		if (channelNotes === undefined) {
			channelNotes = new Array(127);
			const s = 1 + stretch / 100;
			for (let i = 0; i <= 127; i++) {
				channelNotes[i] = 2 ** ((i - 69) * s / 12) * a4Pitch;
			}
			this.tunings.set(stretch, channelNotes);
		}
		return channelNotes;
	}

	begin() {
		this.startTime = this.audioContext.currentTime;
	}

	start() {
		const startTime = this.audioContext.currentTime;
		for (let channel of this.channels) {
			channel.start(startTime);
		}
		this.startTime = startTime;
	}


	nextStep() {
		return Math.trunc((this.audioContext.currentTime - this.startTime) / TIME_STEP) + 1;
	}

	getSamplePlayer(instrumentNumber, note) {
		const instrument = this.sampledInstruments[instrumentNumber];
		if (instrument === undefined) {
			return new SamplePlayer(this.audioContext, Sample.EMPTY_SAMPLE, false);
		} else {
			return instrument.getSamplePlayer(this.audioContext, note);
		}
	}

	setRecordingFormat(mimeType, bitRate) {
		if (this.recorder !== undefined && this.recorder.state !== 'inactive') {
			this.recorder.ondataavailable = undefined;
			this.recorder.stop();
		}

		const me = this;
		this.recordedChunks = [];
		this.recordCommand = 0; // 0 = accumulate data, 1 = accumulate data and call callback, 2 = delete existing data

		const recorder = new MediaRecorder(this.outputStreamNode.stream, {
			mimeType: mimeType,
			audioBitsPerSecond: bitRate,
		});
		this.recorder = recorder;

		recorder.ondataavailable = function (event) {
			if (me.recordCommand === 2) {
				me.recordedChunks = [];
			} else {
				me.recordedChunks.push(event.data);
				if (me.recordCommand === 1) {
					if (me.ondatarecorded) {
						const blob = new Blob(me.recordedChunks, {
							type: me.recorder.mimeType,
						});
						me.ondatarecorded(blob);
					}
					me.recordCommand = 0;
				}
			}
		};

		recorder.onstart = function (event) {
			if (!me.appendRecording) {
				me.recordedChunks = [];
			}
		};

	}

	startRecording() {
		this.recorder.start();
	}

	stopRecording() {
		if (this.recorder.state !== 'inactive') {
			this.recordCommand = 1;
			this.recorder.stop();
		}
	}

	cancelRecording() {
		if (this.recorder.state === 'inactive') {
			this.recordedChunks = [];
		} else {
			this.recordCommand = 2;
			this.recorder.stop();
		}
	}

	pauseRecording() {
		if (this.recorder.state === 'recording') {
			this.recorder.requestData();
		}
		this.recorder.pause();
	}

	resumeRecording() {
		this.recorder.resume();
	}

	requestRecording() {
		if (this.recorder.state === 'recording') {
			this.recordCommand = 1;
			this.recorder.requestData();
		} else {
			const me = this;
			setTimeout(function () {
				const blob = new Blob(me.recordedChunks, {
					type: me.recorder.mimeType,
				});
				me.ondatarecorded(blob);
			});
		}
	}

	get recordingState() {
		return this.recorder.state;
	}

}

class C64OscillatorNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'c64-oscillator-processor', {numberOfInputs: 0, numberOfOutputs: 2});
		this._type = Waveform.TRIANGLE;
	}

	get frequency() {
		return this.parameters.get('frequency');
	}

	get width() {
		return this.parameters.get('width');
	}

	get sync() {
		return this.parameters.get('sync');
	}

	set type(value) {
		this.port.postMessage(value);
		this._type = value;
	}

	get type() {
		return this._type;
	}
}

class SubtractiveSynthChannel {
	constructor(system) {
		const audioContext = system.audioContext;
		this.system = system;
		this.parameters = [
			100,	// velocity
			2,		// attack
			0.5,	// attack curve
			0,		// hold
			50,		// decay
			ChangeType.LINEAR,	// decay shape
			70,		// sustain
			300,	// release
			ChangeType.LINEAR, // release shape
			0,		// set duration to automatic
			Gate.CLOSED, // gate
			Waveform.TRIANGLE, // waveform
			440,	// frequency
			0,		// detune
			[69],	// MIDI note numbers
			0,		// no stretched tuning
			'sine',	// LFO 1 shape
			5,		// LFO 1 rate
			100,	// LFO 1 gain
			0,		// LFO 1 delay
			0,		// LFO 2 attack
			1,		// LFO 1 at a constant frequency
			Direction.UP, // LFO 1 fades up (when an attack is set)
			0,		// LFO 1 doesn't retrigger
			'sine',	// LFO 2 shape
			5,		// LFO 2 rate
			5,		// LFO 2 min rate
			5,		// LFO 2 max rate
			100,	// LFO 2 gain
			0,		// LFO 2 delay
			0,		// LFO 2 attack
			1,		// LFO 2 at a constant frequency
			Direction.UP, // LFO 2 fades up (when an attack is set)
			0,		// LFO 2 doesn't retrigger
			'sine',	// LFO 3 shape
			5,		// LFO 3 rate
			100,	// LFO 3 gain
			0,		// LFO 3 delay
			0,		// LFO 3 attack
			1,		// LFO 3 at a constant frequency
			Direction.UP, // LFO 3 fades up (when an attack is set)
			0,		// LFO 3 doesn't retrigger
			1,		// vibrato uses LFO 1
			0,		// vibrato extent
			0,		// siren extent
			100,	//	volume
			1,		// tremolo uses LFO 1
			0,		// tremolo amount
			0,		// pan
			0,		// leftmost pan change
			0,		// rightmost pan change
			1,		// pan LFO
			Source.OSCILLATOR,
			50,		// pulse width
			50,		// min pulse width
			50,		// max pulse width
			1,		// PWM uses LFO 1
			'lowpass', // filter type
			4400,	// filter frequency
			4400,	// minimum filter frequency
			4400,	// maximum filter frequency
			1,		// filter Q
			1,		// min filter Q
			1,		// max filter Q
			1,		// filter uses LFO 1
			0,		// filter gain
			100,	// filter fully enabled
			0,		// filter fully enabled
			0, 		// no delay
			0,		// no delay
			0,		// no delay
			1,		// delay uses LFO 1
			100,	// delay mix
			0,		// feedback
			0,		// ring modulation
			0,		// sync
			system.globalParameters[0], // line time (125bpm, allegro)
			system.globalParameters[1], // number of ticks for broken chords, glissando and retrigger
			0,		// pattern delay
			0,		// number of ticks to delay
			0,		// retrigger time (ticks)
			0,		// don't use multi-trigger
			100,	// retrigger volume same as initial volume
			1,		// broken chord speed
			Chord.TO_AND_FRO_2,	// chord pattern
			0,		// glissando length
			0,		// use first sample
			0,		// no sample offset
			1,		// envelope scaling for AHD portion of the envelope
		];
		this.velocity = 1;
		this.sustain = volumeCurve(70); // combined sustain and velocity
		this.release = 0.3;
		this.duration = 0.2;
		this.calcEnvelope();

		// State information for processing chords
		this.frequencies = [440];
		this.distanceFromC = 9;
		this.detune = 1;
		this.noteFrequencies = system.getNotes(0);
		this.retriggerVolumeChangeType = ChangeType.SET;
		this.noteIndex = 0;
		this.chordDir = 1;
		this.noteRepeated = false;

		// LFOs
		const lfo1 = new LFO(audioContext);
		this.lfo1 = lfo1;
		const lfo2 = new LFO(audioContext);
		this.lfo2 = lfo2;
		const lfo3 = new LFO(audioContext);
		this.lfo3 = lfo3;
		this.lfo2Mod = new Modulator(audioContext, lfo3, lfo2.oscillator.frequency);
		this.lfos = [lfo1, lfo2, lfo3];

		// Oscillator and oscillator/sample switch
		const oscillator = new C64OscillatorNode(audioContext);
		this.oscillator = oscillator;
		const oscillatorGain = audioContext.createGain();
		oscillator.connect(oscillatorGain);

		// Pulse width modulation
		oscillator.width.value = 0;
		const pwm = new Modulator(audioContext, lfo1, oscillator.width);
		this.pwm = pwm;
		pwm.setMinMax(ChangeType.SET, 0.5, 0.5, audioContext.currentTime);

		// Hard sync
		const syncGain = audioContext.createGain();
		syncGain.gain.value = 0;
		syncGain.connect(oscillator.sync);
		this.syncGain = syncGain;

		// Playing samples
		this.sampleBufferNode = undefined;
		const sampleGain = audioContext.createGain();
		sampleGain.gain.value = 0;
		this.sampleGain = sampleGain;
		const playRateMultiplier = audioContext.createGain();
		playRateMultiplier.gain.value = 1 / 440;
		this.playRateMultiplier = playRateMultiplier;
		const samplePlaybackRate = audioContext.createConstantSource();
		samplePlaybackRate.connect(playRateMultiplier);
		samplePlaybackRate.start();

		// Vibrato
		const vibrato = new Modulator(audioContext, lfo1, oscillator.frequency);
		this.vibrato = vibrato;
		vibrato.connect(samplePlaybackRate.offset);

		// Siren
		const siren = new Modulator(audioContext, lfo3, oscillator.frequency);
		this.siren = siren;
		siren.connect(samplePlaybackRate.offset);

		// Filter
		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;
		oscillatorGain.connect(filter);
		sampleGain.connect(filter);
		this.gains = [oscillatorGain, sampleGain];

		// Filter modulation
		const filterFrequencyMod = new Modulator(audioContext, lfo1, filter.frequency);
		this.filterFrequencyMod = filterFrequencyMod;
		const filterQMod = new Modulator(audioContext, lfo1, filter.Q);
		this.filterQMod = filterQMod;

		// Filter output
		const filteredPath = audioContext.createGain();
		this.filteredPath = filteredPath;
		filter.connect(filteredPath);

		// Filter bypass
		const unfilteredPath = audioContext.createGain();
		this.unfilteredPath = unfilteredPath;
		unfilteredPath.gain.value = 0;
		oscillatorGain.connect(unfilteredPath);
		sampleGain.connect(unfilteredPath);

		// Envelope
		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;
		filteredPath.connect(envelope);
		unfilteredPath.connect(envelope);

		// Ring modulation
		const ringMod = audioContext.createGain();
		const ringInput = audioContext.createGain();
		ringInput.connect(ringMod.gain);
		ringInput.gain.value = 0;
		this.ringMod = ringMod;
		this.ringInput = ringInput;
		envelope.connect(ringMod);

		// Tremolo
		const tremoloGain = audioContext.createGain();
		const tremoloModulator = new Modulator(audioContext, lfo1, tremoloGain.gain);
		this.tremolo = tremoloModulator;
		ringMod.connect(tremoloGain);

		// Delay effect
		const delay = audioContext.createDelay(0.25);
		this.delay = delay;
		const delayedPath = audioContext.createGain();
		this.delayedPath = delayedPath;
		delay.connect(delayedPath);
		const undelayedPath = audioContext.createGain();
		this.undelayedPath = undelayedPath;
		undelayedPath.gain.value = 0;
		tremoloGain.connect(delay)
		tremoloGain.connect(undelayedPath);
		const feedback = audioContext.createGain();
		this.feedback = feedback;
		feedback.gain.value = 0;
		delayedPath.connect(feedback);
		undelayedPath.connect(feedback);
		feedback.connect(delay);
		feedback.connect(undelayedPath);
		const delayOutput = audioContext.createGain();
		this.delayOutput = delayOutput;
		delayedPath.connect(delayOutput);
		undelayedPath.connect(delayOutput);
		const flanger = new Modulator(audioContext, lfo1, delay.delayTime);
		this.flanger = flanger;

		// Panning
		const panner = audioContext.createStereoPanner();
		this.panner = panner;
		delayOutput.connect(panner);
		const panMod = new Modulator(audioContext, lfo1, panner.pan);
		this.panMod = panMod;

		// Volume
		const volume = audioContext.createGain();
		this.volume = volume;
		panner.connect(volume);

		system.addChannel(this, volume);
	}

	connect(channel) {
		const node = channel.ringInput;
		this.filteredPath.connect(node);
		this.unfilteredPath.connect(node);
		this.oscillator.connect(channel.syncGain, 1);
	}

	start(when) {
		if (!this.started) {
			this.lfo1.start(when);
			this.lfo2.start(when);
			this.lfo3.start(when);
			this.started = true;
		}
	}

	calcEnvelope() {
		const params = this.parameters;
		const attack = params[Parameter.ATTACK];
		const endHold = attack + params[Parameter.HOLD];
		const endDecay = endHold + params[Parameter.DECAY];
		this.endAttack = attack / 1000;
		this.endHold = endHold / 1000;
		this.endDecay = endDecay / 1000;
		const attackCurve = params[Parameter.ATTACK_CURVE];
		this.attackConstant = (attack / 1000) / attackCurve;
		this.attackScale = 1 / (1 - Math.E ** -attackCurve);
	}

	playSample(note, time) {
		if (this.sampleBufferNode !== undefined) {
			this.sampleBufferNode.stop(time);
		}
		const parameters = this.parameters;
		const instrumentNumber = parameters[Parameter.SAMPLE];
		const samplePlayer = this.system.getSamplePlayer(instrumentNumber, note);
		this.playRateMultiplier.gain.setValueAtTime(samplePlayer.samplePeriod, time);
		const sampleBufferNode = samplePlayer.bufferNode;
		this.playRateMultiplier.connect(sampleBufferNode.playbackRate);
		sampleBufferNode.connect(this.sampleGain);
		sampleBufferNode.start(time, parameters[Parameter.SAMPLE_OFFSET]);
		this.sampleBufferNode = sampleBufferNode;
	}

	triggerLFOs(when) {
		this.lfo1.trigger(when);
		this.lfo2.trigger(when);
		this.lfo3.trigger(when);
	}

	gate(state, note, velocity, volume, sustainLevel, start) {
		const parameters = this.parameters;
		let beginRelease, endTime;

		const playSample = parameters[Parameter.SOURCE] > 0;
		const scaleAHD = parameters[Parameter.SCALE_AHD];
		const releaseTime = this.release;
		const gain = this.envelope.gain;

		const endAttack = start + scaleAHD * this.endAttack;
		const attackConstant = this.attackConstant * scaleAHD;
		const releaseConstant = 4;

		if ((state & Gate.MULTI_TRIGGERABLE) === 0) {
			gain.cancelAndHoldAtTime(start - 0.001);
			gain.setTargetAtTime(0, start - 0.001, 0.001 / 2);
			if ((state & Gate.OPEN) !== 0) {
				gain.setTargetAtTime(volume * this.attackScale, start, attackConstant);
				gain.setValueAtTime(volume, endAttack);
			}
		} else {
			gain.cancelAndHoldAtTime(start);
			if ((state & Gate.OPEN) !== 0) {
				gain.setTargetAtTime(volume, start, (endAttack - start) / parameters[Parameter.ATTACK_CURVE]);
			}
		}

		switch (state) {
		case Gate.OPEN:
		case Gate.REOPEN:
			this.triggerLFOs(start);
			gain.setValueAtTime(volume, start + scaleAHD * this.endHold);
			gain[parameters[Parameter.DECAY_SHAPE]](sustainLevel, start + scaleAHD * this.endDecay);
			break;

		case Gate.CLOSED:
			endTime = start + releaseTime;
			gain.setTargetAtTime(0, start, releaseTime / releaseConstant);
			if (parameters[Parameter.RELEASE_SHAPE] === ChangeType.EXPONENTIAL) {
				gain.setTargetAtTime(0, start + releaseTime * 7 / releaseConstant, 0.0005);
			} else {
				gain.linearRampToValueAtTime(0, endTime);
			}
			if (this.sampleBufferNode !== undefined) {
				this.sampleBufferNode.stop(endTime);
				this.sampleBufferNode = undefined;
			}
			break;

		case Gate.TRIGGER:
		case Gate.MULTI_TRIGGER:
			if (playSample) {
				this.playSample(note, start);
			}
			this.triggerLFOs(start);
			let endHold = start + scaleAHD * this.endHold;
			let endDecay = start + scaleAHD * this.endDecay;
			const duration = this.duration;
			if (duration > 0) {
				beginRelease = start + this.duration;
				if (beginRelease < endDecay) {
					// shorten hold phase to accommodate short duration
					let newEndHold = endHold - (endDecay - beginRelease);
					if (newEndHold < endAttack) {
						newEndHold = endAttack;
					}
					endDecay = endDecay - (endHold - newEndHold);
					endHold = newEndHold;
					beginRelease = endDecay;
				}
			} else {
				beginRelease = endDecay;
			}
			gain.setValueAtTime(volume, endHold);
			gain[parameters[Parameter.DECAY_SHAPE]](sustainLevel, endDecay);

			if (!playSample) {
				gain.setValueAtTime(sustainLevel, beginRelease);
				if (parameters[Parameter.RELEASE_SHAPE] === ChangeType.EXPONENTIAL) {
					gain.setTargetAtTime(0, beginRelease, releaseTime / releaseConstant);
					gain.setTargetAtTime(0, beginRelease + releaseTime * 7 / releaseConstant, 0.0005);
				} else {
					endTime = beginRelease + releaseTime;
					gain.linearRampToValueAtTime(0, endTime);
				}
			}
			break;

		case Gate.CUT:
			if (this.sampleBufferNode !== undefined) {
				this.sampleBufferNode.stop(start);
				this.sampleBufferNode = undefined;
			}
			break;
		}
	}

	setFrequency(changeType, frequency, when) {
		frequency = frequency * this.detune;
		const vibratoExtent = CENT ** (this.parameters[Parameter.VIBRATO_EXTENT] / 2);
		this.vibrato.cancelAndHoldAtTime(when);
		this.vibrato.setMinMax(changeType, frequency / vibratoExtent, frequency * vibratoExtent, when);
		const sirenExtent = SEMITONE ** (this.parameters[Parameter.SIREN_EXTENT] / 2);
		this.siren.cancelAndHoldAtTime(when);
		// The siren's waveform is inverted, so it's still interesting when siren and vibrato use the same LFO.
		this.siren.setMinMax(changeType, frequency * sirenExtent, frequency / sirenExtent, when);
	}

	setParameters(parameterMap, step, newLine) {
		const me = this;
		const parameters = this.parameters;
		const numLFOs = this.lfos.length;

		let gate = parameterMap.get(Parameter.GATE);
		if (gate !== undefined) {
			gate = gate.value;
		}

		let lineTime = calculateParameterValue(parameterMap.get(Parameter.LINE_TIME), parameters[Parameter.LINE_TIME]);
		let numTicks = calculateParameterValue(parameterMap.get(Parameter.TICKS), parameters[Parameter.TICKS]);
		let delay = calculateParameterValue(parameterMap.get(Parameter.DELAY_TICKS), parameters[Parameter.DELAY_TICKS]);

		if (numTicks > lineTime) {
			numTicks = lineTime;
		} else if (numTicks < 1) {
			numTicks = 1;
		}

		if (delay >= numTicks) {
			delay = numTicks - 1;
		}

		const tickTime = (lineTime * TIME_STEP) / numTicks;

		// Each of these holds a change type (or undefined for no change)
		let dirtyPWM, dirtyFilterFrequency, dirtyFilterQ, dirtyMix, dirtyDelay, dirtyPan;
		let dirtyLFO2Rate;

		let dirtyEnvelope = false;
		let dirtySustain = false;
		let frequencySet = false;
		let sampleChanged = false;

		const now = this.system.audioContext.currentTime;
		if (step === undefined) {
			step = (now - this.system.startTime) / TIME_STEP;
		}
		const time = this.system.startTime + step * TIME_STEP + delay * tickTime;
		const timeDifference = Math.round((time - now) * 1000);
		const callbacks = [];

		let tuningChange = parameterMap.get(Parameter.TUNING_STRETCH);
		if (tuningChange !== undefined) {
			this.noteFrequencies = this.system.getNotes(tuningChange.value);
		}

		for (let [paramNumber, change] of parameterMap) {
			let changeType = change.type;
			let prefix, value;
			if (changeType === ChangeType.MARK) {
				value = parameters[paramNumber];
				changeType = ChangeType.SET;
				prefix = '';
			} else {
				value = change.value;
				prefix = changeType[0];
			}
			let frequency;

			if (paramNumber === Parameter.NOTES) {
				const list = parameters[paramNumber];

				if (prefix === ChangeType.DELTA) {
					for (let i = 0; i < value.length; i++) {
						list[i] = list[i] + list[i];
					}
					changeType = changeType.slice(1);
				} else {
					for (let i = 0; i < value.length; i++) {
						list[i] = value[i];
					}
				}

			} else {

				if (prefix === ChangeType.DELTA) {
					value += parameters[paramNumber];
					changeType = changeType.slice(1);
				} else if (prefix === ChangeType.MULTIPLY) {
					value *= parameters[paramNumber];
					changeType = changeType.slice(1);
				}
				parameters[paramNumber] = value;

			}

			if (changeType === "") {
				changeType = ChangeType.SET;
			}

			switch (paramNumber) {
			case Parameter.ATTACK:
			case Parameter.ATTACK_CURVE:
			case Parameter.HOLD:
			case Parameter.DECAY:
				dirtyEnvelope = true;
				break;

			case Parameter.RELEASE:
				this.release = value / 1000;
				break;

			case Parameter.DURATION:
				this.duration = value / 1000;
				break;

			case Parameter.VELOCITY:
				this.velocity = volumeCurve(value);
				dirtySustain = true;
				break;

			case Parameter.SUSTAIN:
				dirtySustain = true;
				break;

			case Parameter.WAVEFORM:
				callbacks.push(function () {
					me.oscillator.type = value;
				});
				break;

			case Parameter.LFO1_WAVEFORM:
				callbacks.push(function () {
					me.lfo1.oscillator.type = value;
				});
				break;

			case Parameter.LFO2_WAVEFORM:
				callbacks.push(function () {
					me.lfo2.oscillator.type = value;
				});
				break;

			case Parameter.LFO3_WAVEFORM:
				callbacks.push(function () {
					me.lfo3.oscillator.type = value;
				});
				break;

			case Parameter.VIBRATO_LFO:
				value = ((value + numLFOs - 1) % this.lfos.length) + 1;
				parameters[Parameter.VIBRATO_LFO] = value;
				callbacks.push(function () {
					me.vibrato.disconnect();
					me.lfos[value - 1].connect(me.vibrato);
				});
				break;

			case Parameter.TREMOLO_LFO:
				value = ((value + numLFOs - 1) % this.lfos.length) + 1;
				parameters[Parameter.TREMOLO_LFO] = value;
				callbacks.push(function () {
					me.tremolo.disconnect();
					me.lfos[value - 1].connect(me.tremolo);
				});
				break;

			case Parameter.PWM_LFO:
				value = ((value + numLFOs - 1) % this.lfos.length) + 1;
				parameters[Parameter.PWM_LFO] = value;
				callbacks.push(function () {
					me.pwm.disconnect();
					me.lfos[value - 1].connect(me.pwm);
				});
				break;

			case Parameter.FILTER_LFO:
				value = ((value + numLFOs - 1) % this.lfos.length) + 1;
				parameters[Parameter.FILTER_LFO] = value;
				callbacks.push(function () {
					me.filterFrequencyMod.disconnect();
					me.filterQMod.disconnect()
					me.lfos[value - 1].connect(me.filterFrequencyMod);
					me.lfos[value - 1].connect(me.filterQMod);
				});
				break;

			case Parameter.DELAY_LFO:
				value = ((value + numLFOs - 1) % this.lfos.length) + 1;
				parameters[Parameter.DELAY_LFO] = value;
				callbacks.push(function () {
					me.flanger.disconnect();
					me.lfos[value - 1].connect(me.flanger);
				});
				break;

			case Parameter.PAN_LFO:
				value = ((value + numLFOs - 1) % this.lfos.length) + 1;
				parameters[Parameter.PAN_LFO] = value;
				callbacks.push(function () {
					me.panMod.disconnect();
					me.lfos[value - 1].connect(me.panMod);
				});
				break;

			case Parameter.FREQUENCY:
				this.setFrequency(changeType, value, time);
				this.frequencies[0] = value;
				frequencySet = true;
				break;

			case Parameter.NOTES:
				frequency = this.noteFrequencies[value[0]];
				this.setFrequency(changeType, frequency, time);
				frequencySet = true;
				this.frequencies[0] = frequency;
				parameters[Parameter.FREQUENCY] = frequency;
				for (let i = 1; i < value.length; i++) {
					this.frequencies[i] = this.noteFrequencies[value[i]];
				}
				this.frequencies.splice(value.length);
				this.distanceFromC = value[0] - 60;
				break;

			case Parameter.DETUNE:
				this.detune = CENT ** value;
				// fall through

			case Parameter.VIBRATO_EXTENT:
			case Parameter.SIREN_EXTENT:
				this.setFrequency(changeType, parameters[Parameter.FREQUENCY], time);
				break;

			case Parameter.VOLUME:
				this.volume.gain[changeType](volumeCurve(value), time);
				break;

			case Parameter.TREMOLO_DEPTH:
				this.tremolo.setMinMax(changeType, 1 - value / 100, 1, time);
				break;

			case Parameter.LFO1_RATE:
				value = clamp(value);
				this.lfo1.setFrequency(changeType, value, time);
				parameters[Parameter.LFO1_RATE] = value;
				break;

			case Parameter.LFO2_RATE:
				value = clamp(value);
				parameters[Parameter.LFO2_RATE] = value;
				parameters[Parameter.LFO2_MIN_RATE] = value;
				parameters[Parameter.LFO2_MAX_RATE] = value;
				dirtyLFO2Rate = changeType;
				break;

			case Parameter.LFO2_MIN_RATE:
				parameters[Parameter.LFO2_MIN_RATE] = clamp(value);
				dirtyLFO2Rate = changeType;
				this.lfo2.setRetrigger(0, time);
				parameters[Parameter.LFO2_RETRIGGER] = 0;
				break;

			case Parameter.LFO2_MAX_RATE:
				parameters[Parameter.LFO2_MAX_RATE] = clamp(value);
				dirtyLFO2Rate = changeType;
				this.lfo2.setRetrigger(0, time);
				parameters[Parameter.LFO2_RETRIGGER] = 0;
				break;

			case Parameter.LFO3_RATE:
				value = clamp(value);
				this.lfo3.setFrequency(changeType, value, time);
				parameters[Parameter.LFO3_RATE] = value;
				break;

			case Parameter.LFO1_GAIN:
				this.lfo1.gain = value / 100;
				break;

			case Parameter.LFO2_GAIN:
				this.lfo2.gain = value / 100;
				break;

			case Parameter.LFO3_GAIN:
				this.lfo3.gain = value / 100;
				break;

			case Parameter.LFO1_DELAY:
				this.lfo1.delay = value / 1000;
				break;

			case Parameter.LFO2_DELAY:
				this.lfo2.delay = value / 1000;
				break;

			case Parameter.LFO3_DELAY:
				this.lfo3.delay = value / 1000;
				break;

			case Parameter.LFO1_ATTACK:
				this.lfo1.attack = value / 1000;
				break;

			case Parameter.LFO2_ATTACK:
				this.lfo2.attack = value / 1000;

			case Parameter.LFO3_ATTACK:
				this.lfo3.attack = value / 1000;

			case Parameter.LFO1_RATE_MOD:
				this.lfo1.rateMod = value;
				break;

			case Parameter.LFO2_RATE_MOD:
				this.lfo2.rateMod = value;
				break;

			case Parameter.LFO3_RATE_MOD:
				this.lfo3.rateMod = value;
				break;

			case Parameter.LFO1_FADE:
				this.lfo1.fadeDirection = value;
				break;

			case Parameter.LFO2_FADE:
				this.lfo2.fadeDirection = value;
				break;

			case Parameter.LFO3_FADE:
				this.lfo3.fadeDirection = value;
				break;

			case Parameter.LFO1_RETRIGGER:
				value = Math.trunc(Math.abs(value)) % 2;
				this.lfo1.setRetrigger(value, time);
				parameters[Parameter.LFO1_RETRIGGER] = value;
				if (value === 1) {
					parameters[Parameter.LFO1_RATE_MOD] = 1;
				}
				break;

			case Parameter.LFO2_RETRIGGER:
				value = Math.trunc(Math.abs(value)) % 2;
				if (value === 1) {
					parameters[Parameter.LFO2_RATE_MOD] = 1;
					const frequency = parameters[Parameter.LFO2_MIN_RATE];
					this.lfo2.setFrequency(ChangeType.SET, frequency, time);
					parameters[Parameter.LFO2_RATE] = frequency;
					parameters[Parameter.LFO2_MAX_RATE] = frequency;
					dirtyLFO2Rate = dirtyLFO2Rate || ChangeType.SET;
				}
				this.lfo2.setRetrigger(value, time);
				parameters[Parameter.LFO2_RETRIGGER] = value;
				break;

			case Parameter.LFO3_RETRIGGER:
				value = Math.trunc(Math.abs(value)) % 2;
				this.lfo3.setRetrigger(value, time);
				parameters[Parameter.LFO3_RETRIGGER] = value;
				if (value === 1) {
					parameters[Parameter.LFO3_RATE_MOD] = 1;
				}
				break;

			case Parameter.SYNC:
				value = Math.trunc(Math.abs(value)) % 2;
				this.syncGain.gain.setValueAtTime(value, time);
				parameters[Parameter.SYNC] = value;
				break;

			case Parameter.SOURCE:
				if (value === 0 && gate === undefined) {
					const currentGate = parameters[Parameter.GATE];
					if ((currentGate & Gate.TRIGGER) === Gate.TRIGGER) {
						const param = this.envelope.gain;
						param.cancelAndHoldAtTime(time);
						param.setValueAtTime(0, time);
					}
				}
				this.gains[0].gain[changeType](1 - value / 100, time);
				this.gains[1].gain[changeType](value / 100, time);
				break;

			case Parameter.PULSE_WIDTH:
				this.pwm.setMinMax(changeType, value / 100, value / 100, time);
				parameters[Parameter.MIN_PULSE_WIDTH] = value;
				parameters[Parameter.MAX_PULSE_WIDTH] = value;
				break;

			case Parameter.MIN_PULSE_WIDTH:
			case Parameter.MAX_PULSE_WIDTH:
				dirtyPWM = changeType;
				break;

			case Parameter.FILTER_TYPE:
				callbacks.push(function () {
					me.filter.type = value;
				});
				break;

			case Parameter.FILTER_FREQUENCY:
				this.filterFrequencyMod.setMinMax(changeType, value, value, time);
				parameters[Parameter.MIN_FILTER_FREQUENCY] = value;
				parameters[Parameter.MAX_FILTER_FREQUENCY] = value;
				break;

			case Parameter.MIN_FILTER_FREQUENCY:
			case Parameter.MAX_FILTER_FREQUENCY:
				dirtyFilterFrequency = changeType;
				break;

			case Parameter.Q:
				this.filterQMod.setMinMax(changeType, value, value, time);
				parameters[Parameter.MIN_Q] = value;
				parameters[Parameter.MAX_Q] = value;
				break;

			case Parameter.MIN_Q:
			case Parameter.MAX_Q:
				dirtyFilterQ = changeType;
				break;

			case Parameter.FILTER_GAIN:
				this.filter.gain[changeType](value, time);
				break;

			case Parameter.FILTER_MIX:
			case Parameter.UNFILTERED_MIX:
				dirtyMix = changeType;
				break;

			case Parameter.DELAY:
				this.flanger.setMinMax(changeType, value / 1000, value / 1000, time);
				parameters[Parameter.MIN_DELAY] = value;
				parameters[Parameter.MAX_DELAY] = value;
				break;

			case Parameter.MIN_DELAY:
			case Parameter.MAX_DELAY:
				dirtyDelay = changeType;
				break;

			case Parameter.DELAY_MIX:
				this.delayedPath.gain[changeType](value / 100, time);
				this.undelayedPath.gain[changeType](1 - value / 100, time);
				break;

			case Parameter.FEEDBACK:
				this.feedback.gain[changeType](value / 100, time);
				this.delayOutput.gain[changeType](1 / (1 - value / 100), time);
				break;

			case Parameter.PAN:
				this.pannerMod.setMinMax(changeType, value / 100, value / 100, time);
				parameters[Parameter.LEFTMOST_PAN] = value;
				parameters[Parameter.RIGHTMOST_PAN] = value;
				break;

			case Parameter.LEFTMOST_PAN:
			case Parameter.RIGHTMOST_PAN:
				dirtyPan = changeType;
				break;

			case Parameter.RING_MOD:
				this.ringMod.gain[changeType](1 - value / 100, time);
				this.ringInput.gain[changeType](value / 100, time);
				break;

			case Parameter.LINE_TIME:
				parameters[Parameter.LINE_TIME] = lineTime;
				system.globalParameters[0] = lineTime;
				break;

			case Parameter.TICKS:
				parameters[Parameter.TICKS] = numTicks;
				system.globalParameters[1] = numTicks;
				break;

			case Parameter.DELAY_TICKS:
				parameters[Parameter.DELAY_TICKS] = delay;
				break;

			case Parameter.CHORD_PATTERN:
				if (value === Chord.CYCLE) {
					this.chordDir = 1;
				}
				break;

			case Parameter.MULTI_TRIGGER:
				value = Math.trunc(Math.abs(value)) % 2;
				parameters[Parameter.MULTI_TRIGGER] = value;
				break;

			case Parameter.RETRIGGER_VOLUME:
				this.retriggerVolumeChangeType = changeType;
				break;

			case Parameter.SAMPLE:
				sampleChanged = true;
				break;

			case undefined:
				console.error('An undefined synthesizer parameter was used.');
				break;
			} // end switch
		} // end loop over each parameter

		if (dirtyLFO2Rate) {
			this.lfo2Mod.setMinMax(dirtyLFO2Rate, parameters[Parameter.LFO2_MIN_RATE], parameters[Parameter.LFO2_MAX_RATE], time);
		}
		if (dirtyPWM) {
			this.pwm.setMinMax(dirtyPWM, parameters[Parameter.MIN_PULSE_WIDTH] / 100, parameters[Parameter.MAX_PULSE_WIDTH] / 100, time);
		}
		if (dirtyEnvelope) {
			this.calcEnvelope();
		}
		if (dirtySustain) {
			this.sustain = volumeCurve(parameters[Parameter.VELOCITY] * parameters[Parameter.SUSTAIN] / 100);
		}
		if (dirtyFilterFrequency) {
			this.filterFrequencyMod.setMinMax(dirtyFilterFrequency, parameters[Parameter.MIN_FILTER_FREQUENCY], parameters[Parameter.MAX_FILTER_FREQUENCY], time);
		}
		if (dirtyFilterQ) {
			this.filterQMod.setMinMax(dirtyFilterQ, parameters[Parameter.MIN_Q], parameters[Parameter.MAX_Q], time);
		}
		if (dirtyMix) {
			let filtered = volumeCurve(parameters[Parameter.FILTER_MIX]);
			let unfiltered = volumeCurve(parameters[Parameter.UNFILTERED_MIX]);
			const total = filtered + unfiltered;
			if (total < 1 && total > 0) {
				filtered = filtered / total;
				unfiltered = unfiltered / total;
			}
			this.filteredPath.gain[dirtyMix](filtered, time);
			this.unfilteredPath.gain[dirtyMix](unfiltered, time);
		}
		if (dirtyDelay) {
			this.flanger.setMinMax(dirtyDelay, parameters[Parameter.MIN_DELAY] / 1000, parameters[Parameter.MAX_DELAY] / 1000, time);
		}
		if (dirtyPan) {
			this.panMod.setMinMax(dirtyPan, parameters[Parameter.LEFTMOST_PAN] / 100, parameters[Parameter.RIGHTMOST_PAN] / 100, time);
		}

		const gateOpen = parameters[Parameter.GATE] === Gate.OPEN || parameters[Parameter.GATE] === Gate.REOPEN;
		const frequencies = this.frequencies;
		const notes = parameters[Parameter.NOTES];
		let glissandoSteps = parameters[Parameter.GLISSANDO_SIZE];
		let glissandoAmount, prevGlissandoAmount, noteIndex, chordDir, noteRepeated;

		if (gate !== undefined) {
			this.gate(gate, notes[0], parameters[Parameter.VELOCITY], this.velocity, this.sustain, time);
			glissandoAmount = 0;
			prevGlissandoAmount = 0;
			noteIndex = 0;
			chordDir = 1;
			noteRepeated = false;
			if (!frequencySet) {
				this.setFrequency(ChangeType.SET, frequencies[0], time);
			}
		} else if (gateOpen) {
			if (sampleChanged) {
				this.playSample(notes[0], time);
			}
			// Don't repeat glissando but keep the chords smooth.
			glissandoAmount = glissandoSteps;
			prevGlissandoAmount = glissandoAmount;
			glissandoSteps = 0;
			noteIndex = this.noteIndex;
			chordDir = this.chordDir;
			noteRepeated = this.noteRepeated;
		}

		if ((gate & Gate.OPEN) > 0 || (gateOpen && newLine)) {
			// The gate's just been triggered or it's open.
			//TODO handle gate triggered in a previous step but not yet closed.
			//TODO handle gate status change not aligned with line start time.
			const numNotes = frequencies.length;
			const retriggerTicks = parameters[Parameter.RETRIGGER];

			if (glissandoSteps !== 0 || numNotes > 1 || retriggerTicks > 0) {
				const chordTicks = parameters[Parameter.CHORD_SPEED];
				numTicks = numTicks - delay;

				let glissandoPerTick;
				if (glissandoSteps === 0) {
					glissandoPerTick = 0;
				} else if (glissandoSteps > 0) {
				 	glissandoPerTick = (glissandoSteps + 1) / numTicks;
				} else {
					glissandoPerTick = (glissandoSteps - 1) / numTicks;
				}

				let tick = 1;
				let volume = this.velocity;
				const pattern = parameters[Parameter.CHORD_PATTERN];

				const retriggerGate = Gate.TRIGGER + parameters[Parameter.MULTI_TRIGGER] * Gate.MULTI_TRIGGERABLE;
				let retriggerVolumeChange;
				if (this.retriggerVolumeChangeType === ChangeType.SET) {
					retriggerVolumeChange = new Change(ChangeType.SET, volume * parameters[Parameter.RETRIGGER_VOLUME] / 100);
				} else {
					const numTriggers = Math.trunc(numTicks / retriggerTicks);
					let endVolume = volume * parameters[Parameter.RETRIGGER_VOLUME] / 100;
					if (endVolume > 1) {
						endVolume = 1;
					}
					if (this.retriggerVolumeChangeType === ChangeType.LINEAR) {
						retriggerVolumeChange = new Change(ChangeType.DELTA, (endVolume - volume) / numTriggers);
					} else {
						retriggerVolumeChange = new Change(ChangeType.MULTIPLY, (endVolume / volume) ** (1 / numTriggers));
					}
				}

				while (tick < numTicks) {
					const timeOfTick = time + tick * tickTime;

					if (glissandoSteps > 0) {
						glissandoAmount = Math.trunc(tick * glissandoPerTick);
					}
					let newFrequency = glissandoAmount !== prevGlissandoAmount;
					if (numNotes > 1 && tick % chordTicks === 0) {
						noteIndex = noteIndex + chordDir;
						switch (pattern) {
						case Chord.CYCLE:
							noteIndex = noteIndex % numNotes;
							newFrequency = true;
							break;

						case Chord.TO_AND_FRO:
							if (noteIndex === numNotes) {
								noteIndex = numNotes - 2;
								chordDir = -1;
							} else if (noteIndex === -1) {
								noteIndex = 1;
								chordDir = 1;
							}
							newFrequency = true;
							break;

						case Chord.TO_AND_FRO_2:
							if (noteIndex === numNotes) {
								if (noteRepeated) {
									noteIndex = numNotes - 2;
									chordDir = -1;
									newFrequency = true;
									noteRepeated = false;
								} else {
									noteIndex--;
									noteRepeated = true;
								}
							} else if (noteIndex === -1) {
								if (noteRepeated) {
									noteIndex = 1;
									chordDir = 1;
									newFrequency = true;
									noteRepeated = false;
								} else {
									noteIndex++;
									noteRepeated = true;
								}
							} else {
								newFrequency = true;
							}
							break;

						case Chord.RANDOM:
							const oldNoteIndex = noteIndex - 1;
							noteIndex = Math.trunc(Math.random() * numNotes);
							if (noteIndex !== oldNoteIndex) {
								newFrequency = true;
							}
							break;

						}
					}

					if (newFrequency) {
						const frequency = frequencies[noteIndex] * SEMITONE ** glissandoAmount;
						this.setFrequency(ChangeType.SET, frequency, timeOfTick);
					}

					if (tick % retriggerTicks === 0) {
						volume = calculateParameterValue(retriggerVolumeChange, volume);
						const sustain = this.sustain * volume / this.velocity;
						const velocity = inverseVolumeCurve(volume);
						this.gate(retriggerGate, notes[noteIndex], velocity, volume, sustain, timeOfTick);
					}
					prevGlissandoAmount = glissandoAmount;
					tick++;
				}
				this.noteIndex = noteIndex;
				this.chordDir = chordDir;
				this.noteRepeated = noteRepeated;
			}
		}

		const numCallbacks = callbacks.length;
		if (numCallbacks > 0) {
			if (numCallbacks === 1) {
				setTimeout(callbacks[0], timeDifference);
			} else {
				setTimeout(function () {
					for (let callback of callbacks) {
						callback();
					}
				}, timeDifference);
			}
		}
	}

}

function decodeSampleData(arr) {
	const length = arr.byteLength;
	const view = new DataView(arr);
	const buffers = [];
	if (length >= 12 && view.getUint32(0) === 0x464f524d && view.getUint32(8) === 0x38535658) {
		// i.e. An IFF file: FORM <length> 8SVX
		const fileLength = view.getUint32(4) + 8;
		let offset = 12;
		let numOneShotSamples, numRepeatSamples, totalNumSamples, totalAllOctaves, samplesPerHiCycle;
		let sampleRate = 8192;
		let numOctaves = 1;
		let compressionMethod = 0;
		let volume = 1;
		let isStereo = false;

		while (offset < fileLength) {
			const chunkName = view.getUint32(offset);
			const chunkLength = view.getUint32(offset + 4);

			switch (chunkName) {
			case 0x56484452: // VHDR
				numOneShotSamples = view.getUint32(offset + 8);
				numRepeatSamples = view.getUint32(offset + 12);
				totalNumSamples = numOneShotSamples + numRepeatSamples;
				samplesPerHiCycle = view.getUint32(offset + 16);
				sampleRate = view.getUint16(offset + 20);
				numOctaves = view.getUint8(offset + 22);
				totalAllOctaves = totalNumSamples * (2 ** numOctaves - 1);
				compressionMethod = view.getUint8(offset + 23);
				volume = view.getUint32(offset + 24) / 65536;
				break;

			case 0x424f4459: // BODY
				if (totalNumSamples === undefined) {
					// No VHDR header chunk
					totalNumSamples = chunkLength;
				} else {
					isStereo = chunkLength === 2 * totalAllOctaves;
				}
				let numSamplesInOctave = totalNumSamples;
				let subOffset = offset + 8;
				for (let i = 0; i < numOctaves; i++) {
					const buffer = new AudioBuffer({
						length: numSamplesInOctave,
						numberOfChannels: isStereo ? 2 : 1,
						sampleRate: sampleRate,
					});
					buffers[i] = buffer;

					let channelData = buffer.getChannelData(0);
					for (let j = 0; j < numSamplesInOctave; j++) {
						channelData[j] = view.getInt8(subOffset + j) / 128;
					}
					if (isStereo) {
						channelData = buffer.getChannelData(1);
						for (let j = 0; j < numSamplesInOctave; j++) {
							channelData[j] = view.getInt8(subOffset + totalAllOctaves + j) / 128;
						}
					}

					subOffset += numSamplesInOctave;
					numSamplesInOctave *= 2;
				}
				break;
			}

			offset += chunkLength + 8;
			if (chunkLength % 2 === 1) {
				// Pad byte
				offset++;
			}
		}

	} else {

		// Interpret as a RAW file.
		const buffer = new AudioBuffer({
			length: length,
			numberOfChannels: 1,
			sampleRate: 8192,
		});
		buffers[0] = buffer;
		const channelData = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			channelData[i] = view.getInt8(i) / 128;
		}

	}
	return buffers[0];
}

const keymap = new Map();
keymap.set('IntlBackslash', 47);
keymap.set('KeyZ', 48);
keymap.set('KeyS', 49);
keymap.set('KeyX', 50);
keymap.set('KeyD', 51);
keymap.set('KeyC', 52);
keymap.set('KeyV', 53);
keymap.set('KeyG', 54);
keymap.set('KeyB', 55);
keymap.set('KeyH', 56);
keymap.set('KeyN', 57);
keymap.set('KeyJ', 58);
keymap.set('KeyM', 59);
keymap.set('Comma', 60);
keymap.set('KeyL', 61);
keymap.set('Period', 62);
keymap.set('Semicolon', 63);
keymap.set('Slash', 64);
keymap.set('KeyQ', 60);
keymap.set('Digit2', 61);
keymap.set('KeyW', 62);
keymap.set('Digit3', 63);
keymap.set('KeyE', 64);
keymap.set('KeyR', 65);
keymap.set('Digit5', 66);
keymap.set('KeyT', 67);
keymap.set('Digit6', 68);
keymap.set('KeyY', 69);
keymap.set('Digit7', 70);
keymap.set('KeyU', 71);
keymap.set('KeyI', 72);
keymap.set('Digit9', 73);
keymap.set('KeyO', 74);
keymap.set('Digit0', 75);
keymap.set('KeyP', 76);
keymap.set('BracketLeft', 77);
keymap.set('Equal', 78);
keymap.set('BracketRight', 79);


global.Synth = {
	Change: Change,
	SubtractiveSynthChannel: SubtractiveSynthChannel,
	System: SynthSystem,
	ChangeType: ChangeType,
	Direction: Direction,
	Gate: Gate,
	Pattern: Chord,
	Param: Parameter,
	Sample: Sample,
	SampledInstrument: SampledInstrument,
	Source: Source,
	Waveform: Waveform,
	keymap: keymap,

	// Internals exposed as generic reusable code
	Modulator: Modulator,
	Oscillator: C64OscillatorNode,
	decodeSampleData: decodeSampleData,
	enumFromArray: enumFromArray,
	volumeCurve: volumeCurve,
	inverseVolumeCurve: inverseVolumeCurve,
};

})(window);
