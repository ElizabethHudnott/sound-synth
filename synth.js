(function (global) {
'use strict';

const SEMITONE = 2 ** (1 / 12);
const CENT = 2 ** (1 / 1200);
const TWO_PI = 2 * Math.PI;

const LFO_MAX = 20;
const TIME_STEP = 0.02; // 50 steps per second

function calculateParameterValue(change, currentValue, arrayParam) {
	if (change === undefined) {
		return [undefined, currentValue];
	}
	let changeType = change.type;
	const prefix = changeType[0];
	let changeValue = change.value;
	let newValue;
	switch (prefix) {
	case ChangeType.MARK:
		changeType = ChangeType.SET;
		newValue = currentValue;
		break;
	case ChangeType.DELTA:
		if (arrayParam) {
			newValue = currentValue.slice();
			for (let i = 0; i < currentValue.length; i++) {
				newValue[i] += changeValue;
			}
		} else {
			newValue = currentValue + changeValue;
		}
		changeType = changeType.slice(1);
		if (changeType === '') {
			changeType = ChangeType.SET;
		}
		break;
	case ChangeType.MULTIPLY:
		if (arrayParam) {
			newValue = currentValue.slice();
			for (let i = 0; i < currentValue.length; i++) {
				newValue[i] *= changeValue;
			}
		} else {
			newValue = currentValue * changeValue;
		}
		changeType = changeType.slice(1);
		if (changeType === '') {
			changeType = ChangeType.SET;
		}
		break;
	default:
		if (arrayParam) {
			newValue = changeValue.slice();
		} else {
			newValue = changeValue;
		}
	}
	return [changeType, newValue];
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

function fillNoise(buffer) {
	const numberOfChannels = buffer.numberOfChannels;
	const length = buffer.length;
	const leftChannel = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) {
		leftChannel[i] = Math.random() * 2 - 1;
	}
	for (let channelNumber = 1; channelNumber < numberOfChannels; channelNumber++) {
		buffer.copyToChannel(leftChannel, channelNumber);
	}
}

function expCurve(value, power) {
	if (value === 0) {
		return 0;
	} else {
		return 10 ** (-power * (100 - value) / 99);
	}
}

function aWeighting(frequency) {
	const twoPiF4 = 12194.217 * TWO_PI;
	const k = twoPiF4 * twoPiF4 * 10 ** (1.9997 / 20);
	const numerator = 72611603118.9077 * frequency ** 4;
	const divisor1 = frequency + 20.598997 * TWO_PI;
	const divisor2 = frequency + 107.65265 * TWO_PI;
	const divisor3 = frequency + 737.86223 * TWO_PI;
	const divisor4 = frequency + twoPiF4;
	const denominator = divisor1 * divisor1 * divisor2 * divisor3 * divisor4 * divisor4;
	return denominator / numerator;
}

function enumFromArray(array) {
	const result = {};
	for (let i = 0; i < array.length; i++) {
		result[array[i]] = i;
	}
	return Object.freeze(result);
}

class Resource {
	constructor(source, data) {
		this.source = source;
		this.data = data;
	}
}

class ResourceLoadError extends Error {
	constructor(source, message) {
		super(message);
		this.source = message;
	}
}

const Parameter = enumFromArray([
	'NOTES',		// array of MIDI note numbers
	'WAVE_X',		// coordinates for piecewise linear waveform
	'WAVE_Y',
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
	'WAVEFORM',		// Wavetable position
	'MIN_WAVEFORM',	// minumum wavetable position
	'MAX_WAVEFORM',	// maximum wavetable position
	'CHORUS',		// detune between oscillators in cents
	'FREQUENCY',	// in hertz
	'DETUNE',		// overall channel detune in cents
	'TUNING_STRETCH', // in cents
	'SAMPLE_AND_HOLD', // number of samples per second
	'NOISE',		// percentage
	'NOISE_COLOR',	// in hertz
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
	'RING_MOD',		// 0 to 100
	'LINE_TIME',	// in steps
	'GROOVE',		// an array of line times
	'TICKS',		// maximum number of events during a LINE_TIME
	'DELAY_TICKS',	// amount of time to delay the channel by (in ticks)
	'RETRIGGER',	// number of ticks between retriggers
	'MULTI_TRIGGER', // 0 or 1 (for chords)
	'RETRIGGER_VOLUME', // percentage of original note volume
	'CHORD_SPEED',	// number of ticks between notes of a broken chord
	'CHORD_PATTERN', // A value from the Pattern enum
	'GLISSANDO', // number of steps
	'INSTRUMENT',	// array index of the instrument to play.
	'OFFSET', 		// instrument offset in seconds
	'SCALE_AHD',	// dimensionless (-1 or more)
	'MACRO',
	'MACHINE',
	// Parameters below this line only affect the sequencer
	'PHRASE',		// name of the phrase currently playing
	'PATTERN_DELAY', // amount of time to delay the pattern by (in multiples of the line time)
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
	NONE: 'none',
});

class Change {
	static MARK = new Change(ChangeType.MARK);
	static NONE = new Change(ChangeType.NONE);

	constructor(type, value) {
		this.type = type;
		this.value = value;
	}

	clone() {
		return new Change(this.type, this.value);
	}
}

class MacroChange extends Change {
	constructor(type, macro, value) {
		super(type, value);
		this.macro = macro;
	}
}

class MachineChange extends Change {
	constructor(machine, parameterNumber, type, value) {
		super(type, value);
		this.machine = machine;
		this.parameterNumber = parameterNumber;
	}
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

const Wave = Object.freeze({
	SINE: 0,
	TRIANGLE: 1,
	CUSTOM: 2,
	SAWTOOTH: 3,
	PULSE: 4,
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

const noteFrequencies = [];
for (let i = 0; i <= 127; i++) {
	noteFrequencies[i] = 2 ** ((i - 69) / 12) * 440;
}

class MacroFunction {
	static ID = new MacroFunction(0, 1, 1);

	constructor(zeroValue, oneValue, curviness) {
		this.zeroValue = zeroValue;
		this.oneValue = oneValue;
		this.range = oneValue - zeroValue;

		if (curviness >= 0) {
			this.equation = 1;
			this.exponent = curviness
		} else {
			this.equation = -1;
			this.exponent = -curviness;
		}
		if (zeroValue > oneValue) {
			this.equation = -this.equation;
		}
	}

	value(macroValue) {
		if (this.equation === 1) {
			return macroValue ** this.exponent * this.range + this.zeroValue;
		} else {
			return this.oneValue - (1 - macroValue) ** this.exponent * this.range;
		}
	}
}

class Macro {
	constructor() {
		// Map parameter numbers to MacroFunctions
		this.items = new Map();
	}

	set(param, macroFunction) {
		this.items.set(param, macroFunction);
	}

	changes(changeType, macroValue) {
		const changes = new Map();
		for (let [paramNum, func] of this.items) {
			const paramValue = func.value(macroValue);
			changes.set(paramNum, new Change(changeType, paramValue));
		}
		return changes;
	}
}

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
			newOscillator.type = oldOscillator.type;
			newOscillator.start(time);
			newOscillator.connect(this.delayNode);
			this.zeroPoint = time;
			this.rateMod = 1;
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
			const phase = (when - this.zeroPoint + period) % period;
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
		const range = audioContext.createGain();
		this.range = range;
		range.gain.value = 0;
		lfo.connect(this);
		if (carrier === undefined) {
			this.carriers = [];
		} else {
			this.carriers = [carrier];
			range.connect(carrier);
		}
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

class Sample {
	static EMPTY_BUFFER = new AudioBuffer({length: 1, sampleRate: 8000});
	static EMPTY_SAMPLE = new Sample(Sample.EMPTY_BUFFER);

	constructor(buffer) {
		this.buffer = buffer;
		this.loopStart = 0;
		this.loopEnd = Number.MAX_VALUE;
		this.sampledNote = 69;
		this.gain = 1;
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
		newSample.gain = this.gain;
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
		newSample.gain = this.gain;
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
		return max * this.gain;
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
			for (let i = length - 1; i >= 0; i--) {
				data[i] = data[i] - offset;
			}
		}
	}

	amplify(startGain, endGain, from, to) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
				if (endGain === undefined) {
					endGain = startGain;
				}
			}
		}
		const gainGradient = (endGain - startGain) / (to - from);

		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			for (let i = from; i <= to; i++) {
				const gain = startGain + (i - from) * gainGradient;
				data[i] = data[i] * gain;
			}
		}
	}

	chord(notes, instrumentNoteFreqs) {
		const me = this;
		const numNotes = notes.length;
		const oldBuffer = this.buffer;
		let baseNote = this.sampledNote;
		if (notes[0] > baseNote) {
			baseNote = notes[0];
		}
		const baseFrequency = noteFrequencies[baseNote];
		const ratio = baseFrequency / instrumentNoteFreqs[notes[0]];
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			Math.ceil(oldBuffer.length * ratio),
			oldBuffer.sampleRate
		);
		const nodes = [];
		for (let note of notes) {
			const node = context.createBufferSource();
			node.buffer = oldBuffer;
			node.playbackRate.value = instrumentNoteFreqs[note] / baseFrequency;
			if (this.loop) {
				node.loop = true;
				node.loopStart = this.loopStart;
				node.loopEnd = this.loopEnd;
			}
			node.connect(context.destination);
			node.start();
			nodes.push(node);
		}
		let sampledNote = this.sampledNote;
		if (notes[0] < sampledNote) {
			sampledNote = notes[0];
		}
		return context.startRendering().then(function (newBuffer) {
			const newSample = new Sample(newBuffer);
			newSample.loopStart = Math.round(me.loopStart * ratio);
			newSample.loopEnd = Math.round(me.loopEnd * ratio);
			newSample.sampledNote = sampledNote;
			newSample.gain = me.gain;
			return newSample;
		});
	}

	copy(from, to) {
		const buffer = this.buffer;
		const numberOfChannels = buffer.numberOfChannels;
		const copyBuffer = new AudioBuffer({
			length: to - from + 1,
			numberOfChannels: numberOfChannels,
			sampleRate: buffer.sampleRate,
		});
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			const section = data.subarray(from, to + 1);
			copyBuffer.copyToChannel(section, channelNumber);
		}
		const newSample = new Sample(copyBuffer);
		const meLoopStart = this.loopStart;
		if (meLoopStart < to) {
			if (meLoopStart > from) {
				newSample.loopStart = meLoopStart - from;
			}
			const meLoopEnd = this.loopEnd;
			if (meLoopEnd < to) {
				newSample.loopEnd = meLoopEnd - from;
			}
		}
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	remove(from, to) {
		const oldBuffer = this.buffer;
		const numberOfChannels = oldBuffer.numberOfChannels;
		const deleteLength = to - from + 1;
		const newBuffer = new AudioBuffer({
			length: oldBuffer.length - deleteLength,
			numberOfChannels: numberOfChannels,
			sampleRate: oldBuffer.sampleRate,
		});
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const data = oldBuffer.getChannelData(channelNumber);
			const before = data.subarray(0, from);
			newBuffer.copyToChannel(before, channelNumber);
			const after = data.subarray(to + 1);
			newBuffer.copyToChannel(after, channelNumber, from);
		}
		const newSample = new Sample(newBuffer);
		let loopStart = this.loopStart;
		if (loopStart > to) {
			loopStart = loopStart - deleteLength;
		} else if (loopStart >= from) {
			if (from === 0) {
				loopStart = 0;
			} else {
				loopStart = from - 1;
			}
		}
		newSample.loopStart = loopStart;

		let loopEnd = this.loopEnd;
		if (loopEnd > to) {
			if (loopEnd !== Number.MAX_VALUE) {
				loopEnd = loopEnd - deleteLength;
			}
		} else if (loopEnd >= from) {
			if (from === 0) {
				loopEnd = Number.MAX_VALUE;
			} else {
				loopEnd = from - 1;
			}
		}
		newSample.loopEnd = loopEnd;
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	insert(insertSample, position) {
		const me = this;
		const oldBuffer = this.buffer;
		const sampleRate = oldBuffer.sampleRate;
		const playbackRate = noteFrequencies[this.sampledNote] / noteFrequencies[insertSample.sampledNote];
		const insertDuration = insertSample.buffer.duration / playbackRate;
		const insertLength = Math.trunc(insertDuration * sampleRate);
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			oldBuffer.length + insertLength,
			sampleRate
		);
		const beforeDuration = position / sampleRate;
		if (position > 0) {
			const before = context.createBufferSource();
			before.buffer = oldBuffer;
			before.connect(context.destination);
			before.start(0, 0, beforeDuration);
		}
		const insert = context.createBufferSource();
		insert.buffer = insertSample.buffer;
		insert.playbackRate.value = playbackRate;
		const insertGain = context.createGain();
		insertGain.gain.value = insertSample.gain / this.gain;
		insert.connect(insertGain);
		insertGain.connect(context.destination);
		insert.start(beforeDuration);
		const after = context.createBufferSource();
		after.buffer = oldBuffer;
		after.connect(context.destination);
		after.start(beforeDuration + insertDuration, position / sampleRate);

		let loopStart = this.loopStart;
		let loopEnd = this.loopEnd;
		if (
			loopStart === 0 && loopEnd === Number.MAX_VALUE &&
			(insertSample.loopStart > 0 || insertSample.loopEnd !== Number.MAX_VALUE)
		) {
			loopStart = position + insertSample.loopStart;
			loopEnd = position + insertSample.loopEnd;
		} else {
			if (loopStart >= position) {
				loopStart += insertLength;
			}
			if (loopEnd >= position && loopEnd !== Number.MAX_VALUE) {
				loopEnd += insertLength;
			}
		}
		return context.startRendering().then(function (newBuffer) {
			const newSample = new Sample(newBuffer);
			newSample.loopStart = loopStart;
			newSample.loopEnd = loopEnd;
			newSample.sampledNote = me.sampledNote;
			newSample.gain = me.gain;
			return newSample;
		});
	}

	mix(mixSample, position, loop) {
		const me = this;
		const oldBuffer = this.buffer;
		const sampleRate = oldBuffer.sampleRate;
		const playbackRate = noteFrequencies[this.sampledNote] / noteFrequencies[mixSample.sampledNote];
		const mixLength = sampleRate * mixSample.buffer.duration / playbackRate;
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			Math.max(oldBuffer.length, position + mixLength),
			sampleRate
		);
		const thisSource = context.createBufferSource();
		thisSource.buffer = oldBuffer;
		thisSource.connect(context.destination);
		thisSource.start();
		const mixSource = context.createBufferSource();
		mixSource.buffer = mixSample.buffer;
		mixSource.playbackRate.value = playbackRate;
		const mixGain = context.createGain();
		mixGain.gain.value = mixSample.gain / this.gain;
		mixSource.connect(mixGain);
		mixGain.connect(context.destination);
		mixSource.start(position / sampleRate);
		if (loop) {
			mixSource.loop = true;
			mixSource.loopStart = mixSample.loopStart;
			mixSource.loopEnd = mixSample.loopEnd;
		}

		return context.startRendering().then(function (newBuffer) {
			const newSample = new Sample(newBuffer);
			newSample.loopStart = me.loopStart;
			newSample.loopEnd = me.loopEnd;
			newSample.sampledNote = me.sampledNote;
			newSample.gain = me.gain;
			return newSample;
		});
	}

	swapChannels() {
		const buffer = this.buffer;
		const leftCopy = new Float32Array(buffer.length);
		buffer.copyFromChannel(leftCopy, 0);
		buffer.copyToChannel(buffer.getChannelData(1), 0); // copy right -> left
		buffer.copyToChannel(leftCopy, 1); // copy old left -> right
	}

}

class SamplePlayer {
	constructor(audioContext, sample) {
		const bufferNode = audioContext.createBufferSource();
		this.bufferNode = bufferNode;
		const buffer = sample.buffer;
		bufferNode.buffer = buffer;
		bufferNode.playbackRate.value = 0;
		bufferNode.loopStart = sample.loopStart / buffer.sampleRate;
		let loopEnd = sample.loopEnd;
		if (loopEnd !== Number.MAX_VALUE) {
			loopEnd /= buffer.sampleRate;
		}
		bufferNode.loopEnd = loopEnd;
		this.samplePeriod = 1 / noteFrequencies[sample.sampledNote];
		this.gain = sample.gain;
	}
}

class SampledInstrument {

	constructor() {
		this.samples = [];
		this.startingNotes = [];
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
			return new SamplePlayer(audioContext, Sample.EMPTY_SAMPLE);
		}
		for (; i > 0; i--) {
			if (this.startingNotes[i] <= note) {
				break;
			}
		}
		return new SamplePlayer(audioContext, this.samples[i]);
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
			sample.gain = sample.gain / max;
		}
	}

	loadSampleFromURL(audioContext, startingNote, url) {
		const me = this;
		return new Promise(function (resolve, reject) {
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
						const sample = new Sample(buffer);
						me.addSample(startingNote, sample, true);
			  			resolve(new Resource(url, sample));

			  		}).catch(function (error) {
						const sample = new Sample(decodeSampleData(arrCopy));
						me.addSample(startingNote, sample, true);
			  			resolve(new Resource(url, sample));
			  		});
			  	} else {
			  		reject(new ResourceLoadError(url, request.status + ' - ' + request.statusText));
			  	}
		  	});

			request.addEventListener('error', function (event) {
				reject(new ResourceLoadError(url, 'Network error'));
			});

			request.addEventListener('timeout', function (event) {
				reject(new ResourceLoadError(url, 'Timeout'));
			});

		 	request.send();
		});
	}

	loadSampleFromFile(audioContext, startingNote, file) {
		const me = this;
		return new Promise(function (resolve, reject) {
			const reader = new FileReader();
			reader.onloadend = function (event) {
				const arr = event.target.result;
				const arrCopy = arr.slice(0);
		  		audioContext.decodeAudioData(arr)
		  		.then(function(buffer) {
					const sample = new Sample(buffer);
					me.addSample(startingNote, sample, true);
		  			resolve(new Resource(file, sample));

		  		}).catch(function (error) {
					const sample = new Sample(decodeSampleData(arrCopy));
					me.addSample(startingNote, sample, true);
		  			resolve(new Resource(file, sample));
		  		});
			};
			reader.readAsArrayBuffer(file);
		});
	}

}

class SynthSystem {
	constructor(audioContext, callback) {
		const me = this;
		const sampleRate = audioContext.sampleRate;
		this.audioContext = audioContext;
		this.channels = [];
		this.startTime = audioContext.currentTime;	// dummy value overridden by start()
		this.nextLine = 0;

		this._a4Pitch = 440;
		this.tunings = new Map();
		this.instruments = [];

		const volume = audioContext.createGain();
		this.volume = volume;
		volume.connect(audioContext.destination);

		const outputStreamNode = audioContext.createMediaStreamDestination();
		this.outputStreamNode = outputStreamNode;
		this.appendRecording = false;
		this.ondatarecorded = undefined;
		this.setRecordingFormat(undefined, undefined);

		const noiseLength = 30;
		const stereoNoiseBuffer = audioContext.createBuffer(2, noiseLength * sampleRate, sampleRate);
		fillNoise(stereoNoiseBuffer);
		const stereoNoise = audioContext.createBufferSource();
		this.stereoNoise = stereoNoise;
		stereoNoise.buffer = stereoNoiseBuffer;
		stereoNoise.loop = true;
		stereoNoise.loopEnd = noiseLength;
		const monoNoiseBuffer = audioContext.createBuffer(1, noiseLength * sampleRate, sampleRate);
		fillNoise(monoNoiseBuffer);
		const monoNoise = audioContext.createBufferSource();
		this.monoNoise = monoNoise;
		monoNoise.buffer = monoNoiseBuffer;
		monoNoise.loop = true;
		monoNoise.loopEnd = noiseLength;

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

	get numberOfChannels() {
		return this.channels.length;
	}

	get lineTime() {
		if (this.channels.length > 0) {
			return this.channels[0].parameters[Parameter.LINE_TIME];
		} else {
			return 6;
		}
	}

	get ticksPerLine() {
		if (this.channels.length > 0) {
			return this.channels[0].parameters[Parameter.TICKS];
		} else {
			return 8;
		}
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
		this.nextLine -= (this.audioContext.currentTime - this.startTime) / TIME_STEP;
		this.startTime = this.audioContext.currentTime;
	}

	start(when) {
		if (when === undefined) {
			when = this.audioContext.currentTime;
		}
		for (let channel of this.channels) {
			channel.start(when);
		}
		this.stereoNoise.start();
		this.monoNoise.start();
		this.startTime = when;
	}

	nextStep() {
		return Math.trunc((this.audioContext.currentTime - this.startTime) / TIME_STEP) + 1;
	}

	solo(channelNumber, enabled) {
		for (let i = 0; i < this.channels.length; i++) {
			channel.mute = enabled && i !== channelNumber;
		}
	}

	set(parameterNumber, value, delay, changeType, channelNumber) {
		let time;
		if (delay !== undefined) {
			time = this.nextStep() + delay;
		}
		if (changeType === undefined) {
			changeType = ChangeType.SET;
		}
		if (channelNumber === undefined) {
			channelNumber = 0;
		}
		const parameterMap = new Map();
		parameterMap.set(parameterNumber, new Change(changeType, value));
		const newLine = parameterNumber === Parameter.GATE && (value & Gate.OPEN) !== 0;
		if (channelNumber === -1) {
			for (let channel of this.channels) {
				channel.setParameters(parameterMap, time, newLine);
			}
		} else {
			this.channels[channelNumber].setParameters(parameterMap, time, newLine);
		}
	}

	setMacro(macro, value, delay, changeType, channelNumber) {
		let time;
		if (delay !== undefined) {
			time = this.nextStep() + delay;
		}
		if (changeType === undefined) {
			changeType = ChangeType.SET;
		}
		if (channelNumber === undefined) {
			channelNumber = 0;
		}
		const parameterMap = new Map();
		parameterMap.set(Parameter.MACRO, new MacroChange(changeType, macro, value));
		if (channelNumber === -1) {
			for (let channel of this.channels) {
				channel.setParameters(parameterMap, time, false);
			}
		} else {
			this.channels[channelNumber].setParameters(parameterMap, time, false);
		}

	}

	setMachine(machine, parameterNumber, value, delay, changeType, channelNumber) {
		let time;
		if (delay !== undefined) {
			time = this.nextStep() + delay;
		}
		if (changeType === undefined) {
			changeType = ChangeType.SET;
		}
		if (channelNumber === undefined) {
			channelNumber = 0;
		}
		const machineChanges = [new MachineChange(machine, parameterNumber, changeType, value)];
		const parameterMap = new Map();
		parameterMap.set(Parameter.MACHINE, machineChanges);
		this.channels[channelNumber].setParameters(parameterMap, time, false);
	}

	getSamplePlayer(instrumentNumber, note) {
		const instrument = this.instruments[instrumentNumber];
		if (instrument === undefined) {
			return new SamplePlayer(this.audioContext, Sample.EMPTY_SAMPLE);
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

class WavetableNode extends AudioWorkletNode {
	constructor(context, numberOfInputs) {
		super(context, 'wavetable-processor', {
			channelCount: 1,
			channelCountMode: 'explicit',
			numberOfInputs: numberOfInputs,
		});
	}

	get position() {
		return this.parameters.get('position');
	}

}

class ReciprocalNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'reciprocal-processor', {
			channelCount: 1,
			channelCountMode: 'explicit',
		});
	}
}

class SampleAndHoldNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'sample-and-hold-processor', {
			channelCount: 2,
			channelCountMode: 'clamped-max',
		});
	}

	get frequency() {
		return this.parameters.get('frequency');
	}
}

class SubtractiveSynthChannel {
	constructor(system) {
		const audioContext = system.audioContext;
		this.system = system;
		const initialLineTime = system.lineTime;
		this.parameters = [
			[69],	// MIDI note numbers
			[0, 15, 17, 32],		// custom waveform
			[-1, 0.25, -0.25, 1],
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
			Wave.SINE,	// waveform
			Wave.SINE,	// minimum wavetable position
			Wave.SINE,	// maximum wavetable position
			0,		// oscillator tuning separation
			440,	// frequency
			0,		// detune
			0,		// no stretched tuning
			audioContext.sampleRate, // sample and hold frequency
			0,		// no noise
			audioContext.sampleRate / 2, // don't filter the noise
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
			initialLineTime, // line time (125bpm, allegro)
			[],		// groove
			system.ticksPerLine, // number of ticks for broken chords, glissando and retrigger
			0,		// number of ticks to delay
			0,		// retrigger time (ticks)
			0,		// don't use multi-trigger
			100,	// retrigger volume same as initial volume
			1,		// broken chord speed
			Chord.TO_AND_FRO_2,	// chord pattern
			0,		// glissando length
			-1,		// use oscillator
			0,		// no sample offset
			1,		// envelope scaling for AHD portion of the envelope
		];
		this.usingOscillator = true;
		this.samplePlayer = undefined;
		this.sampleLooping = false;
		this.noiseLevel = 0;
		this.velocity = 1;
		this.sustain = expCurve(70, 1); // combined sustain and velocity
		this.release = 0.3;
		this.duration = 0.2;
		this.calcEnvelope();
		this.macroValues = new Map();

		// State information for processing chords
		this.frequencies = [440];
		this.distanceFromC = 9;
		this.detune = 1;
		this.noteFrequencies = system.getNotes(0);
		this.grooveIndex = 0;
		this.retriggerVolumeChangeType = ChangeType.SET;
		this.noteIndex = 0;
		this.chordDir = 1;
		this.noteRepeated = false;
		this.scheduledUntil = 0;

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
		const sine = audioContext.createOscillator();
		this.sine = sine;
		const triangle = audioContext.createOscillator();
		triangle.type = 'triangle';
		this.triangle = triangle;
		const triangleGain = audioContext.createGain();
		triangle.connect(triangleGain);
		const shaper = new WaveShaperNode(audioContext);
		this.shaper = shaper;
		shaper.curve = this.waveShapeFromCoordinates();
		triangleGain.connect(shaper);
		const saw = audioContext.createOscillator();
		saw.type = 'sawtooth';
		this.saw = saw;
		const sawGain = audioContext.createGain();
		saw.connect(sawGain);
		const wavetable = new WavetableNode(audioContext, 5);
		this.wavetable = wavetable;
		sine.connect(wavetable, 0, 0);
		triangleGain.connect(wavetable, 0, 1);
		shaper.connect(wavetable, 0, 2);
		sawGain.connect(wavetable, 0, 3);
		const oscillatorGain = audioContext.createGain();
		this.oscillatorGain = oscillatorGain;
		wavetable.connect(oscillatorGain);
		const wavetableMod = new Modulator(audioContext, lfo1, wavetable.position);
		this.wavetableMod = wavetableMod;
		wavetableMod.setMinMax(ChangeType.SET, Wave.SINE, Wave.SINE, audioContext.currentTime);
		triangleGain.gain.value = 0.85;
		sawGain.gain.value = 0.38;

		// Pulse width modulation
		const pwmDetune = audioContext.createGain();
		this.pwmDetune = pwmDetune;
		const reciprocal = new ReciprocalNode(audioContext);
		pwmDetune.connect(reciprocal);
		const dutyCycle = audioContext.createGain();
		reciprocal.connect(dutyCycle);
		const pwm = new Modulator(audioContext, lfo1, dutyCycle.gain);
		this.pwm = pwm;
		pwm.setMinMax(ChangeType.SET, 0.5, 0.5, audioContext.currentTime);
		const sawDelay = audioContext.createDelay(0.05);
		dutyCycle.connect(sawDelay.delayTime);
		const inverter = audioContext.createGain();
		inverter.gain.value = -1;
		sawGain.connect(inverter);
		inverter.connect(sawDelay);
		sawGain.connect(wavetable, 0, 4);
		sawDelay.connect(wavetable, 0, 4);

		// Playing samples
		this.sampleBufferNode = undefined;
		const sampleGain = audioContext.createGain();
		this.sampleGain = sampleGain;
		const samplePan = audioContext.createStereoPanner();
		sampleGain.connect(samplePan);
		const playRateMultiplier = audioContext.createGain();
		playRateMultiplier.gain.value = 1 / 440;
		this.playRateMultiplier = playRateMultiplier;
		const samplePlaybackRate = audioContext.createConstantSource();
		samplePlaybackRate.connect(playRateMultiplier);
		samplePlaybackRate.connect(pwmDetune);
		samplePlaybackRate.start();

		// Noise
		const noiseFilter = audioContext.createBiquadFilter();
		this.noiseFilter = noiseFilter;
		noiseFilter.frequency.value = audioContext.sampleRate / 2;
		system.stereoNoise.connect(noiseFilter);
		const noiseGain = audioContext.createGain();
		this.noiseGain = noiseGain;
		noiseGain.gain.value = 0;
		noiseFilter.connect(noiseGain);

		// Sample and Hold
		const sampleAndHold = new SampleAndHoldNode(audioContext);
		this.sampleAndHold = sampleAndHold;
		samplePan.connect(sampleAndHold);

		// Vibrato
		const vibrato = new Modulator(audioContext, lfo1);
		this.vibrato = vibrato;
		vibrato.connect(sine.frequency);
		vibrato.connect(triangle.frequency);
		vibrato.connect(saw.frequency);
		vibrato.connect(samplePlaybackRate.offset);

		// Siren
		const siren = new Modulator(audioContext, lfo3);
		this.siren = siren;
		siren.connect(sine.frequency);
		siren.connect(triangle.frequency);
		siren.connect(saw.frequency);
		siren.connect(samplePlaybackRate.offset);

		// Filter
		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;
		oscillatorGain.connect(filter);
		sampleAndHold.connect(filter);

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
		sampleAndHold.connect(unfilteredPath);

		// Ring modulation
		const ringMod = audioContext.createGain();
		const ringInput = audioContext.createGain();
		ringInput.connect(ringMod.gain);
		ringInput.gain.value = 0;
		this.ringMod = ringMod;
		this.ringInput = ringInput;
		filteredPath.connect(ringMod);
		unfilteredPath.connect(ringMod);
		noiseGain.connect(ringMod);

		// Envelope
		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;
		ringMod.connect(envelope);

		// Tremolo
		const tremoloGain = audioContext.createGain();
		const tremoloModulator = new Modulator(audioContext, lfo1, tremoloGain.gain);
		this.tremolo = tremoloModulator;
		envelope.connect(tremoloGain);

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

		// Mute
		const mute = audioContext.createGain();
		this.muteControl = mute;
		volume.connect(mute);

		system.addChannel(this, mute);
	}

	connect(channel) {
		const node = channel.ringInput;
		this.filteredPath.connect(node);
		this.unfilteredPath.connect(node);
	}

	start(when) {
		if (!this.started) {
			this.sine.start(when);
			this.triangle.start(when);
			this.saw.start(when);
			this.lfo1.start(when);
			this.lfo2.start(when);
			this.lfo3.start(when);
			this.started = true;
		}
	}

	toggleMute() {
		const param = this.muteControl.gain;
		param.value = 1 - param.value;
	}

	set mute(muted) {
		this.muteControl.gain.value = muted ? 0 : 1;
	}

	get mute() {
		return this.muteControl.gain.value === 0;
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
		const instrumentNumber = parameters[Parameter.INSTRUMENT];
		const samplePlayer = this.system.getSamplePlayer(instrumentNumber, note);
		this.playRateMultiplier.gain.setValueAtTime(samplePlayer.samplePeriod, time);
		const sampleBufferNode = samplePlayer.bufferNode;
		this.playRateMultiplier.connect(sampleBufferNode.playbackRate);
		sampleBufferNode.connect(this.sampleGain);

		const volume = samplePlayer.gain;
		this.sampleGain.gain.setValueAtTime(volume * (1 - this.noiseLevel), time);

		sampleBufferNode.start(time, parameters[Parameter.OFFSET]);
		this.sampleBufferNode = sampleBufferNode;
		this.samplePlayer = samplePlayer;
	}

	triggerLFOs(when) {
		this.lfo1.trigger(when);
		this.lfo2.trigger(when);
		this.lfo3.trigger(when);
	}

	gate(state, note, volume, sustainLevel, start, gain) {
		const parameters = this.parameters;
		const noise = this.noiseLevel;
		let scaleAHD, duration, usingSamples;
		const releaseTime = this.release;

		if (gain === undefined) {
			gain = this.envelope.gain;
			scaleAHD = parameters[Parameter.SCALE_AHD];
			duration = this.duration;
			usingSamples = parameters[Parameter.INSTRUMENT] >= 0
			if (usingSamples) {
				if (this.usingOscillator) {
					if ((state & Gate.OPEN) === 0) {
						usingSamples = false;
					} else {
						// First time the gate's been opened since switching into sample mode.
						this.oscillatorGain.gain.setValueAtTime(0, start);
						this.usingOscillator = false;
					}
				}
			} else if (!this.usingOscillator) {
				if ((state & Gate.OPEN) === 0) {
					usingSamples = true;
				} else {
					// First time the gate's been opened since switching into oscillator mode.
					if ((state & Gate.MULTI_TRIGGERABLE) === 0) {
						this.sampleGain.gain.setValueAtTime(0, start);
					}
					this.oscillatorGain.gain.setValueAtTime(1 - noise, start);
					this.noiseGain.gain.setValueAtTime(noise, start);
					this.usingOscillator = true;
				}
			}
		} else {
			usingSamples = false;
			const playbackRate = this.noteFrequencies[note] * this.samplePlayer.samplePeriod;
			scaleAHD = 1 / playbackRate;
			duration = this.sampleBufferNode.buffer.duration / playbackRate - releaseTime;
		}

		const endAttack = start + scaleAHD * this.endAttack;
		const attackConstant = this.attackConstant * scaleAHD;
		let beginRelease, endTime;
		const releaseConstant = 4;

		if ((state & Gate.MULTI_TRIGGERABLE) === 0) {
			gain.cancelAndHoldAtTime(start - 0.001);
			gain.setTargetAtTime(0, start - 0.001, 0.001 / 2);
			if ((state & Gate.OPEN) !== 0) {
				if (usingSamples) {
					gain.setValueAtTime(volume, start);
				} else {
					gain.setTargetAtTime(volume * this.attackScale, start, attackConstant);
					gain.setValueAtTime(volume, endAttack);
				}
			}
		} else {
			gain.cancelAndHoldAtTime(start);
			if ((state & Gate.OPEN) !== 0) {
				if (usingSamples) {
					gain.setValueAtTime(volume, start);
				} else {
					gain.setTargetAtTime(volume, start, (endAttack - start) / parameters[Parameter.ATTACK_CURVE]);
				}
			}
		}

		if (usingSamples) {
			const me = this;
			switch (state) {
			case Gate.OPEN:
			case Gate.REOPEN:
				this.triggerLFOs(start);
				this.playSample(note, start);
				this.sampleBufferNode.loop = true;
				this.sampleLooping = true;
				break;

			case Gate.CLOSED:
				if (this.sampleBufferNode !== undefined) {
					this.sampleBufferNode.loop = false;
					this.sampleLooping = false;
				}
				break;

			case Gate.TRIGGER:
			case Gate.MULTI_TRIGGER:
				this.triggerLFOs(start);
				this.playSample(note, start);
				const sampleBufferNode = this.sampleBufferNode;
				if (duration > sampleBufferNode.loopStart * sampleBufferNode.playbackRate) {
					sampleBufferNode.loop = true;
					this.sampleLooping = true;
					beginRelease = start + duration;
					const timeDifference = Math.round((beginRelease - this.system.audioContext.currentTime) * 1000);
					setTimeout(function () {
						if (me.sampleBufferNode === sampleBufferNode) {
							sampleBufferNode.loop = false;
							me.sampleLooping = false;
						}
					}, timeDifference);
				} else {
					this.sampleLooping = false;
				}
				break;

			case Gate.CUT:
				if (this.sampleBufferNode !== undefined) {
					this.sampleBufferNode.stop(start);
					this.sampleBufferNode = undefined;
					this.sampleLooping = false;
				}
				break;
			}
			if (noise > 0) {
				this.gate(state, note, volume * noise, sustainLevel * noise, start, this.noiseGain.gain);
			}
			return;
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
			break;

		case Gate.TRIGGER:
		case Gate.MULTI_TRIGGER:
			this.triggerLFOs(start);
			let endHold = start + scaleAHD * this.endHold;
			let endDecay = start + scaleAHD * this.endDecay;
			if (duration > 0) {
				beginRelease = start + duration;
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
			gain.setValueAtTime(sustainLevel, beginRelease);

			if (parameters[Parameter.RELEASE_SHAPE] === ChangeType.EXPONENTIAL) {
				gain.setTargetAtTime(0, beginRelease, releaseTime / releaseConstant);
				gain.setTargetAtTime(0, beginRelease + releaseTime * 7 / releaseConstant, 0.0005);
			} else {
				endTime = beginRelease + releaseTime;
				gain.linearRampToValueAtTime(0, endTime);
			}
			break;

		case Gate.CUT:
			if (this.sampleBufferNode !== undefined) {
				this.sampleBufferNode.stop(start);
				this.sampleBufferNode = undefined;
				this.sampleLooping = false;
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

	waveShapeFromCoordinates() {
		const xValues = this.parameters[Parameter.WAVE_X];
		const yValues = this.parameters[Parameter.WAVE_Y];
		let listLength = Math.min(xValues.length, yValues.length);
		const shapeLength = xValues[listLength - 1] + 1;
		const shape = new Float32Array(shapeLength);
		let prevX = 0;
		let prevY, i;
		if (xValues[0] === 0) {
			shape[0] = yValues[0];
			prevY = shape[0];
			i = 1;
		} else {
			prevY = 0;
			i = 0;
		}
		for (; i < listLength; i++) {
			const x = xValues[i];
			const y = yValues[i];
			const gradient = (y - prevY) / (x - prevX);
			for (let j = prevX + 1; j < x; j++) {
				let interpolatedY = prevY + gradient * (j - prevX);
				shape[j] = interpolatedY;
			}
			shape[x] = y;
			prevX = x;
			prevY = y;
		}
		return shape;
	}

	setParameters(parameterMap, step, newLine) {
		const me = this;
		const parameters = this.parameters;
		const numLFOs = this.lfos.length;

		const macroChange = parameterMap.get(Parameter.MACRO);
		if (macroChange !== undefined) {
			parameterMap = new Map(parameterMap);
			const macro = macroChange.macro;
			let oldMacroValue = this.macroValues.get(macro);
			if (oldMacroValue === undefined) {
				oldMacroValue = 0;
			}
			const [changeType, newMacroValue] = calculateParameterValue(macroChange, oldMacroValue, false);
			this.macroValues.set(macro, newMacroValue);
			const macroChanges = macro.changes(changeType, newMacroValue);
			for (let [paramNumber, change] of macroChanges) {
				const explicitChange = parameterMap.get(paramNumber);
				if (explicitChange === undefined || explicitChange.type === ChangeType.MARK) {
					parameterMap.set(paramNumber, change);
				}
			}
		}

		let gate = parameterMap.get(Parameter.GATE);
		if (gate !== undefined) {
			gate = gate.value;
		}

		let groove, grooveIndex, numTempos, lineTime;
		const grooveChange = parameterMap.get(Parameter.GROOVE);
		if (grooveChange === undefined) {
			groove = parameters[Parameter.GROOVE];
			grooveIndex = this.grooveIndex;
			numTempos = groove.length;
			if (grooveIndex >= numTempos) {
				grooveIndex = 0;
			}
		} else {
			groove = calculateParameterValue(grooveChange, parameters[Parameter.GROOVE], true)[1];
			parameters[Parameter.GROOVE] = groove;
			grooveIndex = 0;
			numTempos = groove.length;
		}
		if (numTempos === 0) {
			lineTime = parameters[Parameter.LINE_TIME];
		} else {
			lineTime = groove[grooveIndex];
			if (newLine) {
				this.grooveIndex = (grooveIndex + 1) % numTempos;
			}
		}

		const lineTimeChange = parameterMap.get(Parameter.LINE_TIME);
		if (lineTimeChange !== undefined) {
			lineTime = calculateParameterValue(lineTimeChange, lineTime, false)[1];
			parameters[Parameter.LINE_TIME] = lineTime;
		}

		let numTicks = calculateParameterValue(parameterMap.get(Parameter.TICKS), parameters[Parameter.TICKS], false)[1];
		if (numTicks < 1) {
			numTicks = 1;
		}

		const tickTime = (lineTime * TIME_STEP) / numTicks;

		if (step === undefined) {
			step = (Math.max(this.system.audioContext.currentTime + 0.002, this.scheduledUntil) - this.system.startTime) / TIME_STEP;
		}
		const delay = calculateParameterValue(parameterMap.get(Parameter.DELAY_TICKS), parameters[Parameter.DELAY_TICKS], false)[1];
		const time = this.system.startTime + step * TIME_STEP + delay * tickTime;

		// Each of these holds a change type (or undefined for no change)
		let dirtyWavetable, dirtyPWM, dirtyFilterFrequency, dirtyFilterQ, dirtyMix;
		let dirtyDelay, dirtyPan, dirtyLFO2Rate;

		let dirtyEnvelope = false;
		let dirtySustain = false;
		let dirtyCustomWave = false;
		let frequencySet = false;
		let endRetrigger = false;
		const callbacks = [];

		let tuningChange = parameterMap.get(Parameter.TUNING_STRETCH);
		if (tuningChange !== undefined) {
			this.noteFrequencies = this.system.getNotes(tuningChange.value);
		}

		for (let [paramNumber, change] of parameterMap) {
			if (paramNumber === Parameter.GROOVE) {
				continue;
			} else if (paramNumber === Parameter.MACHINE) {
				const machineChanges = [];
				const machines = new Set();
				for (let machineChange of change) {
					const machine = machineChange.machine;
					machines.add(machine);
					const machineParams = machine.parameters;
					const machineParamNum = machineChange.parameterNumber;
					const currentValue = machineParams[machineParamNum];
					const arrayParam = Array.isArray(currentValue);
					const [changeType, value] = calculateParameterValue(machineChange, currentValue, arrayParam);
					machineParams[machineParamNum] = value;
					machineChanges.push(new MachineChange(machine, machineParamNum, changeType, value));
				}
				for (let machine of machines) {
					const machineCallbacks = machine.setParameters(machineChanges, time);
					if (machineCallbacks) {
						callbacks.push(...machineCallbacks);
					}
				}
				continue;
			}
			const arrayParam = paramNumber <= Parameter.WAVE_Y;
			let [changeType, value] = calculateParameterValue(change, parameters[paramNumber], arrayParam);
			parameters[paramNumber] = value;

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
				this.velocity = expCurve(value, 1);
				dirtySustain = true;
				break;

			case Parameter.SUSTAIN:
				dirtySustain = true;
				break;

			case Parameter.WAVEFORM:
				this.wavetableMod.setMinMax(changeType, value, value, time);
				parameters[Parameter.MIN_WAVEFORM] = value;
				parameters[Parameter.MAX_WAVEFORM] = value;
				break;

			case Parameter.MIN_WAVEFORM:
			case Parameter.MAX_WAVEFORM:
				dirtyWavetable = changeType;
				break;

			case Parameter.WAVE_X:
			case Parameter.WAVE_Y:
				dirtyCustomWave = changeType;
				break;

			case Parameter.CHORUS:
				this.sine.detune[changeType](value, time);
				this.saw.detune[changeType](-value, time);
				this.pwmDetune.gain[changeType](CENT ** -value, time);
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

			case Parameter.NOTES: {
				let frequency = this.noteFrequencies[value[0]];
				this.setFrequency(changeType, frequency, time);
				frequencySet = true;
				this.frequencies[0] = frequency;
				parameters[Parameter.FREQUENCY] = frequency;
				for (let i = 1; i < value.length; i++) {
					this.frequencies[i] = this.noteFrequencies[value[i]];
				}
				this.frequencies.splice(value.length);
				this.distanceFromC = value[0] - 60;
				this.noteIndex = 0;
				break;
			}

			case Parameter.DETUNE:
				this.detune = CENT ** value;
				// fall through

			case Parameter.VIBRATO_EXTENT:
			case Parameter.SIREN_EXTENT:
				this.setFrequency(changeType, parameters[Parameter.FREQUENCY], time);
				break;

			case Parameter.NOISE:
				this.noiseLevel = expCurve(value, 1);
				break;

			case Parameter.NOISE_COLOR:
				this.noiseFilter.frequency[changeType](value, time);
				this.noiseGain.gain[changeType](expCurve(parameters[Parameter.NOISE], 1) * aWeighting(value), time);
				break;

			case Parameter.SAMPLE_AND_HOLD:
				this.sampleAndHold.frequency[changeType](value, time);
				break;

			case Parameter.VOLUME:
				this.volume.gain[changeType](expCurve(value, 1), time);
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

			case Parameter.TICKS:
				parameters[Parameter.TICKS] = numTicks;
				break;

			case Parameter.DELAY_TICKS:
				parameters[Parameter.DELAY_TICKS] = delay;
				break;

			case Parameter.CHORD_PATTERN:
				if (value === Chord.CYCLE) {
					this.chordDir = 1;
				}
				break;

			case Parameter.RETRIGGER:
				if (value === 0) {
					endRetrigger = true;
				}
				break;

			case Parameter.MULTI_TRIGGER:
				value = Math.trunc(Math.abs(value)) % 2;
				parameters[Parameter.MULTI_TRIGGER] = value;
				break;

			case Parameter.RETRIGGER_VOLUME:
				this.retriggerVolumeChangeType = changeType;
				break;

			case Parameter.INSTRUMENT:
				if (value < 0) {
					// Switch to oscillator
					if (this.sampleLooping) {
						// Stop sample from looping
						callbacks.push(function () {
							me.sampleBufferNode.loop = false;
						});
						this.sampleLooping = false;
					}
				}
				const currentGate = parameters[Parameter.GATE];
				if (gate === undefined && (currentGate & Gate.TRIGGER) === Gate.OPEN) {
					gate = currentGate;
				}
				break;

			case undefined:
				console.error('An undefined synthesizer parameter was used.');
				break;
			} // end switch
		} // end loop over each parameter

		if (dirtyLFO2Rate) {
			this.lfo2Mod.setMinMax(dirtyLFO2Rate, parameters[Parameter.LFO2_MIN_RATE], parameters[Parameter.LFO2_MAX_RATE], time);
		}
		if (dirtyWavetable) {
			const min = parameters[Parameter.MIN_WAVEFORM];
			let max = parameters[Parameter.MAX_WAVEFORM];
			if (min > max) {
				max = max + 5;
			}
			this.wavetableMod.setMinMax(dirtyWavetable, min, max, time);
		}
		if (dirtyPWM) {
			this.pwm.setMinMax(dirtyPWM, parameters[Parameter.MIN_PULSE_WIDTH] / 100, parameters[Parameter.MAX_PULSE_WIDTH] / 100, time);
		}
		if (dirtyEnvelope) {
			this.calcEnvelope();
		}
		if (dirtySustain) {
			this.sustain = expCurve(parameters[Parameter.VELOCITY] * parameters[Parameter.SUSTAIN] / 100, 1);
		}
		if (dirtyCustomWave) {
			const shape = this.waveShapeFromCoordinates();
			callbacks.push(function () {
				me.shaper.curve = shape;
			});
		}
		if (dirtyFilterFrequency) {
			this.filterFrequencyMod.setMinMax(dirtyFilterFrequency, parameters[Parameter.MIN_FILTER_FREQUENCY], parameters[Parameter.MAX_FILTER_FREQUENCY], time);
		}
		if (dirtyFilterQ) {
			this.filterQMod.setMinMax(dirtyFilterQ, parameters[Parameter.MIN_Q], parameters[Parameter.MAX_Q], time);
		}
		if (dirtyMix) {
			let filtered = expCurve(parameters[Parameter.FILTER_MIX], 1);
			let unfiltered = expCurve(parameters[Parameter.UNFILTERED_MIX], 1);
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

		const gateOpen = (parameters[Parameter.GATE] & Gate.TRIGGER) === Gate.OPEN;
		const frequencies = this.frequencies;
		const notes = parameters[Parameter.NOTES];
		let glissandoSteps = parameters[Parameter.GLISSANDO];
		const retriggerTicks = parameters[Parameter.RETRIGGER];
		let glissandoAmount, prevGlissandoAmount, noteIndex, chordDir, noteRepeated;

		if (gate !== undefined) {
			this.gate(gate, notes[0], this.velocity, this.sustain, time);
			glissandoAmount = 0;
			prevGlissandoAmount = 0;
			noteIndex = 0;
			chordDir = 1;
			noteRepeated = false;
			if (!frequencySet) {
				this.setFrequency(ChangeType.SET, frequencies[0], time);
			}
		} else if (gateOpen) {
			// Don't repeat glissando but keep the chords smooth.
			glissandoAmount = glissandoSteps;
			prevGlissandoAmount = glissandoAmount;
			glissandoSteps = 0;
			noteIndex = this.noteIndex;
			chordDir = this.chordDir;
			noteRepeated = this.noteRepeated;
			if (endRetrigger) {
				this.gate(Gate.REOPEN, notes[noteIndex] + glissandoAmount, this.velocity, this.sustain, time);
			}
		}

		if ((gate & Gate.OPEN) > 0 || (gateOpen && newLine)) {
			// The gate's just been triggered or it's open.
			//TODO handle gate triggered in a previous step but not yet closed.
			this.system.nextLine = step + lineTime;
			const numNotes = frequencies.length;

			if (glissandoSteps !== 0 || numNotes > 1 || retriggerTicks > 0) {
				const chordTicks = parameters[Parameter.CHORD_SPEED];
				numTicks = numTicks - (delay % numTicks);

				let glissandoPerTick;
				if (glissandoSteps === 0) {
					glissandoPerTick = 0;
				} else if (glissandoSteps > 0) {
				 	glissandoPerTick = (glissandoSteps + 1) / numTicks;
				} else {
					glissandoPerTick = (glissandoSteps - 1) / numTicks;
				}

				let tick = gate === undefined ? 0 : 1;
				let volume = this.velocity;
				let endVolume = expCurve(volume * parameters[Parameter.RETRIGGER_VOLUME], 1);
				if (endVolume > 1) {
					endVolume = 1;
				}
				const pattern = parameters[Parameter.CHORD_PATTERN];

				const retriggerGate = Gate.TRIGGER + parameters[Parameter.MULTI_TRIGGER] * Gate.MULTI_TRIGGERABLE;
				let retriggerVolumeChange;
				if (this.retriggerVolumeChangeType === ChangeType.SET) {
					retriggerVolumeChange = new Change(ChangeType.SET, endVolume);
				} else {
					const numTriggers = Math.trunc((numTicks - 1) / retriggerTicks);
					if (this.retriggerVolumeChangeType === ChangeType.LINEAR) {
						retriggerVolumeChange = new Change(ChangeType.DELTA, (endVolume - volume) / numTriggers);
					} else {
						retriggerVolumeChange = new Change(ChangeType.MULTIPLY, (endVolume / volume) ** (1 / numTriggers));
					}
				}
				let scheduledUntil = this.scheduledUntil;

				while (tick < numTicks) {
					const timeOfTick = time + tick * tickTime;

					if (glissandoSteps !== 0) {
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
						scheduledUntil = timeOfTick;
					}

					if (tick % retriggerTicks === 0) {
						volume = calculateParameterValue(retriggerVolumeChange, volume, false)[1];
						const sustain = this.sustain * volume / this.velocity;
						this.gate(retriggerGate, notes[noteIndex] + glissandoAmount, volume, sustain, timeOfTick);
						scheduledUntil = timeOfTick;
					}
					prevGlissandoAmount = glissandoAmount;
					tick++;
				}
				this.noteIndex = noteIndex;
				this.chordDir = chordDir;
				this.noteRepeated = noteRepeated;
				this.scheduledUntil = scheduledUntil;
			}
		}

		const numCallbacks = callbacks.length;
		if (numCallbacks > 0) {
			const timeDifference = Math.round((time - this.system.audioContext.currentTime) * 1000);
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
		return lineTime;
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
	MachineChange: MachineChange,
	Macro: Macro,
	MacroFunction: MacroFunction,
	MacroChange: MacroChange,
	Pattern: Chord,
	Param: Parameter,
	Resource: Resource,
	ResourceLoadError: ResourceLoadError,
	Sample: Sample,
	SampledInstrument: SampledInstrument,
	Wave: Wave,
	keymap: keymap,

	// Internals exposed as generic reusable code
	Modulator: Modulator,
	ReciprocalNode: ReciprocalNode,
	SampleAndHoldNode: SampleAndHoldNode,
	WavetableNode: WavetableNode,
	aWeighting: aWeighting,
	decodeSampleData: decodeSampleData,
	enumFromArray: enumFromArray,
	fillNoise: fillNoise,
	expCurve: expCurve,
};

})(window);

class Machine {
	constructor(parameters) {
		this.inputs = [];
		this.outputs = [];
		this.parameters = parameters;
	}

	connect(before, after) {
		if (before && after) {
			before.disconnect(after);
		}
		if (before) {
			for (let input of this.inputs) {
				before.connect(input);
			}
		}
		if (after) {
			for (let output of this.outputs) {
				output.connect(after);
			}
		}
	}
}

Machines = {};
