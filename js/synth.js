(function (global) {
'use strict';

const PATH = document.currentScript.src.slice(0, -8); // minus synth.js

const SEMITONE = 2 ** (1 / 12);
const CENT = 2 ** (1 / 1200);
const SHORTEST_TIME = 1 / 44100
const TWO_PI = 2 * Math.PI;

const LFO_MAX = 20;
const TIME_STEP = 0.02; // 50 steps per second
const TRIGGER_TIME = 0.002;

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

function calculateParameterValue(change, currentValue, arrayParam) {
	if (change === undefined) {
		return [undefined, currentValue];
	}
	let changeType = change.type;
	const changeMode = changeType & CHANGE_TYPE_MASK;
	changeType = changeType & (~CHANGE_TYPE_MASK);
	const changeValue = change.value;
	let newValue;
	switch (changeMode) {
	case ChangeType.MARK:
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

function downloadArrayBuffer(url) {
	return new Promise(function (resolve, reject) {
		const request = new XMLHttpRequest();
		request.open('GET', url);
		request.responseType = 'arraybuffer';
		request.timeout = 60000;

		request.addEventListener('load', function (event) {
	  		if (request.status < 400) {
	  			resolve(new Resource(url, request.response));
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

function enumFromArray(array) {
	const result = {};
	for (let i = 0; i < array.length; i++) {
		result[array[i]] = i;
	}
	return Object.freeze(result);
}

function equalValues(a, b) {
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false;
		}
		const length = a.length;
		if (length !== b.length) {
			return false;
		}
		for (let i = 0; i < length; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
	} else {
		return a === b;
	}
}

function expCurve(value, power) {
	if (value === 0) {
		return 0;
	} else {
		return 10 ** (-power * (100 - value) / 99);
	}
}

function fillNoise(buffer) {
	const length = buffer.length;
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) {
		data[i] = Math.random() * 2 - 1;
	}
}

function gcd(a, b) {
	while (b !== 0) {
		const temp = b;
		b = a % b;
		a = temp;
	}
	return a;
}

function lcm(a, b) {
	return a / gcd(a, b) * b;
}

function randomize(value, amount, allowNegative) {
	if (!allowNegative && value < amount) {
		if (value <= 0) {
			return value + Math.random() * amount;
		} else {
			return Math.random() * (value + amount);
		}
	} else {
		return value + Math.random() * 2 * amount - amount;
	}
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
	'LINE_TIME',	// in steps
	'GROOVE',		// an array of line times
	'GROOVE_SPEED',	// how many lines each step of the groove applies for
	'MACRO',
	'INSTRUMENT',	// array index of the instrument to play.
	// Parameters above this line are calculated before the main loop
	'NOTES',		// array of MIDI note numbers
	'WAVE_X',		// coordinates for piecewise linear waveform
	'WAVE_Y',
	// Parameters above this line are array parameters
	'VELOCITY',		// 1 to 127
	'ATTACK',		// in milliseconds
	'ATTACK_CURVE', // 0.5 = linear approximation, 3 = good exponential choice
	'HOLD',			// in milliseconds
	'DECAY',		// in milliseconds
	'DECAY_SHAPE',	// ChangeType.LINEAR or ChangeType.EXPONENTIAL
	'SUSTAIN',		// percentage
	'RELEASE',		// in milliseconds
	'RELEASE_SHAPE', // ChangeType.LINEAR or ChangeType.EXPONENTIAL
	'DURATION',		// as a fraction of the line time (0 = auto)
	'SAMPLE_DECAY',	// 0 = no envelope for samples, 1 = use hold and decay
	'GLIDE',		// as a fraction of the line time
	'GATE',			// CLOSED, OPEN, TRIGGER, CUT, REOPEN or RETRIGGER
	'WAVEFORM',		// Wavetable position
	'MIN_WAVEFORM',	// minimum wavetable position
	'MAX_WAVEFORM',	// maximum wavetable position
	'WAVEFORM_LFO',	// which LFO to use for the wavetable position
	'CHORUS',		// detune between oscillators in cents
	'FREQUENCY',	// in hertz
	'DETUNE',		// overall channel detune in cents
	'TUNING_STRETCH', // in cents
	'NOISE_TRACKING', // frequency x noiseTracking = number of noise samples per second (0 = don't sample and hold)
	'LFO1_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO1_RATE',	// in hertz
	'LFO1_PHASE',	// 0 to 360
	'LFO1_GAIN',	// -100 to 100
	'LFO1_DELAY',	// in milliseconds
	'LFO1_ATTACK',	// in milliseconds
	'LFO1_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO1_FADE', // one of the Direction enums
	'LFO1_RETRIGGER', // 0 or 1
	'LFO2_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO2_RATE',	// in hertz
	'LFO2_PHASE',	// 0 to 360
	'LFO2_GAIN',	// -100 to 100
	'LFO2_DELAY',	// in milliseconds
	'LFO2_ATTACK',	// in milliseconds
	'LFO2_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO2_FADE', // one of the Direction enums
	'LFO2_RETRIGGER', // 0 or 1
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
	'FILTER_FREQUENCY_LFO',	// which LFO to use
	'Q',			// 0.0001 to 1000
	'MIN_Q',		// 0.0001 to 1000
	'MAX_Q',		// 0.0001 to 1000
	'Q_LFO',		// which LFO to use
	'FILTER_LFO',	// Controls FILTER_FREQUENCY_LFO and Q_LFO together
	'FILTER_GAIN',	// -40dB to 40dB
	'FILTER_MIX',	// percentage (may be more than 100)
	'UNFILTERED_MIX', // percentage
	'DELAY',		// milliseconds
	'MIN_DELAY',	// milliseconds
	'MAX_DELAY',	// milliseconds
	'DELAY_LFO',	// which LFO to use
	'DELAY_MIX',	// percentage (may be more than 100)
	'FEEDBACK',		// -100 to 100
	'RING_MOD',		// 0 to 100
	'TICKS',		// maximum number of events during a LINE_TIME
	'DELAY_TICKS',	// amount of time to delay the channel by (in ticks)
	'IDLE_TIME',	// time spent idle after rendering a line (proportion of the line time)
	'RETRIGGER',	// number of ticks between retriggers
	'LEGATO_RETRIGGER', // 0 or 1 (for chords)
	'RETRIGGER_VOLUME', // percentage of original note volume
	'CHORD_SPEED',	// number of ticks between notes of a broken chord
	'CHORD_PATTERN', // A value from the Pattern enum
	'GLISSANDO',	// Number of semitones
	'GLISSANDO_TICKS', // Number of ticks
	'OFFSET', 		// instrument offset (0-256)
	'SCALE_AHD',	// dimensionless (-1 or more)
	'MACHINE',
	// Parameters below this line only affect the sequencer and don't require defaults
	'PHRASE',		// name of the phrase currently playing (If the name is not found then no phrase will be used.)
	'PHRASE_OFFSET', // line number to begin playing the phrase from
	'PHRASE_TRANSPOSE', // note that replaces the current note in the phrase
	'LINE_REPEAT',	// number of times to repeat the current row
	'LOOP',			// a positive integer or zero to set loop start point
	'BREAK',		// breaks out of the last iteration of a loop early
]);

const ChangeType = Object.freeze({
	SET: 0,
	LINEAR: 1,
	EXPONENTIAL: 2,
	NONE: 3,
	DELTA: 4,		//standalone or with LINEAR or EXPONENTIAL
	MULTIPLY: 8,	//standalone or with LINEAR or EXPONENTIAL
	MARK: 12,
});
const CHANGE_TYPE_MASK = 12;

const changeMethod = {};
changeMethod[ChangeType.SET] = 'setValueAtTime';
changeMethod[ChangeType.LINEAR] = 'linearRampToValueAtTime';
changeMethod[ChangeType.EXPONENTIAL] = 'exponentialRampToValueAtTime';

const ChangeTypes = (function() {
	const all = new Set();
	all.add(ChangeType.MARK);

	const set = new Set();
	set.add(ChangeType.SET);
	all.add(ChangeType.SET);

	const absolute = new Set();
	absolute.add(ChangeType.SET);
	absolute.add(ChangeType.LINEAR);
	absolute.add(ChangeType.EXPONENTIAL);
	all.add(ChangeType.SET);
	all.add(ChangeType.LINEAR);
	all.add(ChangeType.EXPONENTIAL);

	const delta = new Set();
	delta.add(ChangeType.DELTA);
	delta.add(ChangeType.DELTA + ChangeType.LINEAR);
	delta.add(ChangeType.DELTA + ChangeType.EXPONENTIAL);
	all.add(ChangeType.DELTA);
	all.add(ChangeType.DELTA + ChangeType.LINEAR);
	all.add(ChangeType.DELTA + ChangeType.EXPONENTIAL);

	const multiply = new Set();
	multiply.add(ChangeType.MULTIPLY);
	multiply.add(ChangeType.MULTIPLY + ChangeType.LINEAR);
	multiply.add(ChangeType.MULTIPLY + ChangeType.EXPONENTIAL);
	all.add(ChangeType.MULTIPLY);
	all.add(ChangeType.MULTIPLY + ChangeType.LINEAR);
	all.add(ChangeType.MULTIPLY + ChangeType.EXPONENTIAL);

	const none = new Set();
	none.add(ChangeType.NONE);
	// not part of "all" because it's not actually a change

	return Object.freeze({
		SET: Object.freeze(set),
		ABSOLUTE: Object.freeze(absolute),
		DELTA: Object.freeze(delta),
		MULTIPLY: Object.freeze(multiply),
		ALL: Object.freeze(all),
		NONE: Object.freeze(none),
	});
})();

class Change {
	static MARK = new Change(ChangeType.MARK);
	static NONE = new Change(ChangeType.NONE);

	constructor(type, value) {
		this.type = type;
		this.value = value;
	}

	clone() {
		if (Array.isArray(this.value)) {
			return new Change(this.type, this.value.slice());
		} else {
			return new Change(this.type, this.value);
		}
	}

	equals(change) {
		if (change === undefined) {
			return false;
		}
		if (this.type !== change.type) {
			return false;
		}
		const value = this.value;
		const otherValue = change.value;
		if (Array.isArray(value)) {
			if (!Array.isArray(otherValue)) {
				return false;
			}
			const length = value.length;
			if (length !== otherValue.length) {
				return false;
			}
			for (let i = 0; i < length; i++) {
				if (value[i] !== otherValue[i]) {
					return false;
				}
			}
			return true;
		} else {
			return value === otherValue;
		}
	}
}

class MacroChange extends Change {
	constructor(type, macro, value) {
		super(type, value);
		this.macro = macro;
	}

	clone() {
		return new MacroChange(this.type, this.macro, this.value);
	}
}

class MachineChange extends Change {
	constructor(machine, parameterNumber, type, value) {
		super(type, value);
		this.machine = machine;
		this.parameterNumber = parameterNumber;
	}

	clone() {
		if (Array.isArray(this.value)) {
			return new MachineChange(this.machine, this.parameterNumber, this.type, this.value.slice());
		} else {
			return new MachineChange(this.machine, this.parameterNumber, this.type, this.value);
		}
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
	LEGATO_TRIGGER: 7,
	LEGATO: 4, // add to OPEN or TRIGGER
});

const Wave = Object.freeze({
	SINE: 0,
	TRIANGLE: 1,
	SAWTOOTH: 2,
	CUSTOM: 3,
	PULSE: 4,
	NOISE: 10,
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

function noteFromFrequency(frequency, a4Pitch) {
	var noteNumber = 12 * Math.log2(frequency / a4Pitch);
	return Math.round(noteNumber) + 69;
}

const numberOfCurvePoints = 256;
const sinFadeOut = new Array(numberOfCurvePoints);
const sinFadeIn = new Array(numberOfCurvePoints);
for (let i = 0; i < numberOfCurvePoints; i++) {
	sinFadeOut[i] = 0.5 * Math.cos(Math.PI * i / (numberOfCurvePoints - 1)) + 0.5;
	sinFadeIn[i] = 1 - sinFadeOut[i];
}

class MacroFunction {
	static ID = new MacroFunction(0, 1, 1, 1);

	constructor(y0, x1, y1, curviness) {
		this.y0 = y0;
		this.x1 = x1;
		this.y1 = y1;
		this.range = y1 - y0;

		if (curviness >= 0) {
			this.equation = 1;
			this.exponent = curviness
		} else {
			this.equation = -1;
			this.exponent = -curviness;
		}
		if (y0 > y1) {
			this.equation = -this.equation;
		}
		if (this.equation === 1) {
			let y1Prime = x1 ** this.exponent;
			const divisor = gcd(y1Prime, this.range);
			this.y1Prime = y1Prime / divisor;
			this.range = this.range / divisor;
		}
	}

	value(macroValue) {
		if (macroValue >= this.x1) {
			return this.y1;
		} else if (this.equation === 1) {
			return macroValue ** this.exponent / this.y1Prime * this.range + this.y0;
		} else {
			return this.y1 - (1 - macroValue / this.x1) ** this.exponent * this.range;
		}
	}
}

MacroFunction.ID.value = function (macroValue) {
	return macroValue;
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

class TempoAutomation {
	constructor(time1, value1, time2, value2) {
		this.value1 = value1;
		this.time1 = time1;
		this.value2 = value2;
		this.time2 = time2;
		const gradient = (value2 - value1) / (time2 - time1);
		this.gradient = gradient;
		this.intersect = value1 - time1 * gradient;
		this.power = gradient * time1 / value1;
		this.multiplier = Math.exp((value1 * Math.log(value1) - gradient * time1 * Math.log(time1)) / value1);
		this.rate = -gradient / value2;
		this.relativeValue = 1;
	}

	initialize() {
		this.relativeValue = 1;
	}

	getValue(paramChange, lineTime) {
		let changeType, scaled, finalValue;

		if (paramChange === undefined) {
			changeType = ChangeType.SET;
		} else {
			[changeType, this.relativeValue] = calculateParameterValue(paramChange, this.relativeValue, false);
		}

		if (lineTime < this.time1 && this.intersect < 0 && this.value1 >= 0) {
			if (this.value1 === 0) {
				scaled = 0;
			} else {
				scaled = this.multiplier * lineTime ** this.power;
			}
		} else if (lineTime > this.time2 && this.gradient < 0 && this.value2 >= 0) {
			if (this.value2 === 0) {
				scaled = 0;
			} else {
				scaled = this.value2 * Math.exp(this.rate * (this.time2 - lineTime));
			}
		} else {
			scaled = this.gradient * lineTime + this.intersect;
		}

		finalValue = this.relativeValue * scaled;
		return new Change(changeType, finalValue);
	}
}


class LFO {
	constructor(system) {
		this.system = system;
		const audioContext = system.audioContext;
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

		this.phase = 0; // 0 <= phase < 1
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

	stopChanges() {
		this.delayNode.delayTime.cancelScheduledValues(0);
		this.envelope.gain.cancelScheduledValues(0);
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
		this.system.makeChange(param, changeType, frequency, time, this.system.audioContext.currentTime);
		this.frequency = frequency;
	}

	setRetrigger(value, time) {
		if (value && !this.retrigger) {
			const oldOscillator = this.oscillator;
			oldOscillator.stop(time);
			const newOscillator = this.system.audioContext.createOscillator();
			newOscillator.frequency.value = this.frequency;
			newOscillator.type = oldOscillator.type;
			newOscillator.start(time);
			newOscillator.connect(this.delayNode);
			this.system.disposeAudioParam(oldOscillator.frequency);
			this.oscillator = newOscillator;
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
			const phase = (when - this.zeroPoint + period * (1 + this.phase)) % period;
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
				this.system.makeChange(frequency, ChangeType.LINEAR, endRate, endAttack);
			}
		}
	}

	connect(destination) {
		this.envelope.connect(destination);
	}

	disconnect(destination) {
		this.envelope.disconnect(destination);
	}

}

class Modulator {
	constructor(system, lfo1, lfo2, carrier) {
		this.system = system;
		const range = system.audioContext.createGain();
		range.gain.value = 0;
		this.range = range;

		const lfo1Gain = system.audioContext.createGain();
		lfo1.connect(lfo1Gain);
		lfo1Gain.connect(range);
		this.lfo1Gain = lfo1Gain;
		const lfo2Gain = system.audioContext.createGain();
		lfo2Gain.gain.value = 0;
		lfo2.connect(lfo2Gain);
		lfo2Gain.connect(range);
		this.lfo2Gain = lfo2Gain;

		if (carrier === undefined) {
			this.carriers = [];
			this.centre = undefined;
		} else {
			this.carriers = [carrier];
			range.connect(carrier);
			this.centre = carrier.value;
		}
	}

	setMinMax(changeType, min, max, time, now) {
		const multiplier = (max - min) / 2;
		this.system.makeChange(this.range.gain, changeType, multiplier, time, now);

		const centre = min + multiplier;
		for (let carrier of this.carriers) {
			this.system.makeChange(carrier, changeType, centre, time, now);
		}
		this.centre = centre;
	}

	connect(carrier) {
		this.range.connect(carrier);
		const carriers = this.carriers;
		if (!carriers.includes(carrier)) {
			if (carriers.length == 0) {
				this.centre = carrier.value;
			} else {
				this.system.makeChange(carrier, ChangeType.SET, this.centre, this.system.audioContext.currentTime);
			}
			this.carriers.push(carrier);
		}
	}

	setBalance(changeType, balance, time, now) {
		const amplitude = expCurve(balance * 100, 1);
		this.system.makeChange(this.lfo2Gain.gain, changeType, amplitude, time, now);
		this.system.makeChange(this.lfo1Gain.gain, changeType, 1 - amplitude, time, now);
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
		const newSample = new Sample();
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

	changeSampleRate(sampleRate) {
		const newSample = new Sample();
		const oldBuffer = this.buffer;
		const numberOfChannels = oldBuffer.numberOfChannels;
		const newBuffer = new AudioBuffer({
			length: oldBuffer.length,
			numberOfChannels: numberOfChannels,
			sampleRate: sampleRate,
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

	exportToWav() {
		return audioBufferToWav(this.buffer);
	}

	autotune(a4Pitch, from, to) {
		if (a4Pitch === undefined) {
			a4Pitch = 440;
		}
		const numberOfChannels = this.buffer.numberOfChannels;
		let total = 0;
		let numChannelsMatched = 0;
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const [frequency, correlation] = this.frequency(channelNumber, from ,to);
			if (correlation >= 0.9) {
				total += frequency;
				numChannelsMatched++;
			}
		}
		if (numChannelsMatched > 0) {
			const meanFrequency = total / numChannelsMatched;
			this.sampledNote = noteFromFrequency(meanFrequency, a4Pitch);
		}
	}

	reverse(from, to) {
		const buffer = this.buffer;
		if (to === undefined) {
			to = buffer.length - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const halfRange = Math.trunc((to - (from - 1)) / 2);
		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			for (let i = 0; i < halfRange; i++) {
				const temp = data[from + i];
				data[from + i] = data[to - i];
				data[to - i] = temp;
			}
		}
	}

	pingPong(from, to) {
		const oldBuffer = this.buffer;
		const oldLength = oldBuffer.length;
		if (to === undefined) {
			to = oldLength - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const numberOfChannels = oldBuffer.numberOfChannels;
		const pongLength = to - from;
		const newBuffer = new AudioBuffer({
			length: oldLength + pongLength,
			numberOfChannels: oldBuffer.numberOfChannels,
			sampleRate: oldBuffer.sampleRate,
		});

		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const oldData = oldBuffer.getChannelData(channelNumber);
			const newData = newBuffer.getChannelData(channelNumber);
			const before = oldData.subarray(0, to + 1);
			newBuffer.copyToChannel(before, channelNumber);
			for (let i = to + 1; i <= to + pongLength; i++) {
				newData[i] = before[to - (i - to)];
			}
			if (to < oldLength - 1) {
				const after = oldData.subarray(to + 1);
				newBuffer.copyToChannel(after, channelNumber, to + pongLength + 1);
			}
		}

		const newSample = new Sample(newBuffer);
		const loopStart = this.loopStart;
		newSample.loopStart = loopStart;
		let loopEnd = this.loopEnd;
		if (loopEnd >= oldLength) {
			loopEnd = oldLength - 1;
		}
		if (loopStart >= from && loopEnd <= to) {
			const distance = (to - 1) - loopStart + 1;
			newSample.loopEnd = to + distance;
		} else {
			if (loopEnd > to) {
				newSample.loopEnd = loopEnd + pongLength;
			} else {
				newSample.loopEnd = this.loopEnd;
			}
		}
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	polarityFlip(channelNumber, from, to) {
		const buffer = this.buffer;
		if (to === undefined) {
			to = buffer.length - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const data = buffer.getChannelData(channelNumber);
		for (let i = from; i <= to; i++) {
			data[i] = -data[i];
		}
	}

	peakAmplitude(from, to) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		let max = 0;
		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			for (let i = from; i <= to; i++) {
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

	rms(from, to) {
		const numberOfChannels = this.buffer.numberOfChannels;
		const length = this.buffer.length;
		let sumOfSquares = 0;
		let value;
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const data = this.buffer.getChannelData(channelNumber);
			for (let i = from; i <= to; i++) {
				value = data[i];
				sumOfSquares += value * value;
			}
		}
		return Math.sqrt(sumOfSquares / (numberOfChannels * length));
	}

	/**Finds the sample's frequency using autocorrelation. Returns two values. The first
	 * is the frequency identified and the second is a measure of the strength of the
	 * correlation between 0 and 1. A correlation of at least 0.9 is recommended as the
	 * cut-off for a reliable match.
	 */
	frequency(channelNumber, from, to) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}

		const rms = this.rms(from, to);

		if (rms < 0.01) {
			// Not enough signal
			return [undefined, 0];
		}

		const minSamples = 1;
		const goodEnoughCorrelation = 0.9;
		const data = buffer.getChannelData(channelNumber);
		const maxSamples = Math.trunc((to - from + 1) / 2);
		const maxSample = from + maxSamples - 1;
		const correlations = new Array(maxSamples);
		let bestOffset;
		let bestCorrelation = 0;
		let lastCorrelation = 1;
		let foundGoodCorrelation = false;

		for (let offset = minSamples; offset < maxSamples; offset++) {
			let correlation = 0;
			for (let i = from; i <= maxSample; i++) {
				correlation += Math.abs(data[i] - data[i + offset]);
			}

			correlation = 1 - correlation / maxSamples;
			correlations[offset] = correlation;

			if (correlation >= goodEnoughCorrelation && correlation > lastCorrelation) {
				foundGoodCorrelation = true;
				if (correlation > bestCorrelation) {
					bestCorrelation = correlation;
					bestOffset = offset;
				}
			} else if (foundGoodCorrelation) {
				/*
				 * Short-circuit - we found a good correlation, then a bad one, so we'd just
				 * be seeing copies from here. Now we need to tweak the offset by
				 * interpolating between the values to the left and right of the best offset
				 * and shifting it a bit.  This is complex and HACKY in this code. We need to
				 * do a curve fit on correlations[] around bestOffset in order to better
				 * determine precise (anti-aliased) offset.

				 * We know bestOffset >=1 because foundGoodCorrelation cannot go to true
				 * until the second pass (offset=1) and we can't drop into this clause until
				 * the following pass because it's an else if.
				 */
				const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];
				return [buffer.sampleRate / (bestOffset + 8 * shift), bestCorrelation];
			}
			lastCorrelation = correlation;
		}
		return [buffer.sampleRate / bestOffset, bestCorrelation];
	}

	removeOffset(channel) {
		const buffer = this.buffer;
		const length = buffer.length;
		let fromChannel, toChannel;
		if (channel === undefined) {
			fromChannel = 0;
			toChannel = buffer.numberOfChannels - 1;
		} else {
			fromChannel = channel;
			toChannel = channel;
		}
		for (let channelNumber = fromChannel; channelNumber <= toChannel; channelNumber++) {
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

	normalize(from, to) {
		const length = this.buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const amplitude = this.peakAmplitude(from, to);
		const gain = 1 / amplitude;
		if (from === 0 && to === length - 1) {
			this.gain *= gain;
		} else {
			this.amplify(gain, from, to);
		}
	}

	amplify(gain, from, to) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}

		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			for (let i = from; i <= to; i++) {
				data[i] = data[i] * gain;
			}
		}
	}

	fade(changeType, startGain, endGain, from, to) {
		const me = this;
		const oldBuffer = this.buffer;
		const bufferLength = oldBuffer.length;
		const sampleRate = oldBuffer.sampleRate;
		if (to === undefined) {
			to = bufferLength - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			bufferLength,
			sampleRate,
		);
		const bufferNode = context.createBufferSource();
		bufferNode.buffer = oldBuffer;
		bufferNode.start();
		const fade = context.createGain();
		bufferNode.connect(fade);
		fade.connect(context.destination);

		const startTime = from / sampleRate;
		const endTime = to / sampleRate;
		fade.gain.setValueAtTime(1, 0);
		fade.gain.setValueAtTime(startGain, startTime);

		switch (changeType) {
		case ChangeType.SET:
			fade.gain.setValueAtTime(endGain, endTime);
			break;

		case ChangeType.LINEAR:
			fade.gain.linearRampToValueAtTime(endGain, endTime);
			break;

		case ChangeType.EXPONENTIAL:
			const timeSpan = endTime - startTime - SHORTEST_TIME;
			fade.gain.setTargetAtTime(endGain, startTime + SHORTEST_TIME, timeSpan / 5);
			break;
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

	chord(intervals, instrumentNoteFreqs) {
		const me = this;
		const oldBuffer = this.buffer;
		let baseNote = this.sampledNote;
		const baseFrequency = noteFrequencies[baseNote];
		const ratio = baseFrequency / instrumentNoteFreqs[baseNote];
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			Math.ceil(oldBuffer.length * ratio),
			oldBuffer.sampleRate
		);
		const nodes = [];
		for (let interval of intervals) {
			const note = baseNote + interval - 1;
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
		return context.startRendering().then(function (newBuffer) {
			const newSample = new Sample(newBuffer);
			newSample.loopStart = Math.round(me.loopStart * ratio);
			if (me.loopEnd < Number.MAX_VALUE) {
				newSample.loopEnd = Math.round(me.loopEnd * ratio);
			}
			newSample.sampledNote = me.sampledNote;
			newSample.gain = me.gain;
			return newSample;
		});
	}

	findZero(position, channelNumber, direction) {
		const length = this.buffer.length;
		const data = this.buffer.getChannelData(channelNumber);
		let afterPosition = position;
		let afterValue = data[position];
		let beforePosition = position;
		let beforeValue = afterValue;
		if (afterValue > 0) {
			for (let searchPosition = position + 1; searchPosition < length; searchPosition++) {
				const value = data[searchPosition];
				if (value < afterValue) {
					if (value < 0 && -value >= afterValue) {
						break;
					}
					afterValue = value;
					afterPosition = searchPosition;
					if (afterValue <= 0) {
						break;
					}
				}
			}
		} else if (afterValue < 0) {
			for (let searchPosition = position + 1; searchPosition < length; searchPosition++) {
				const value = data[searchPosition];
				if (value >= afterValue) {
					if (value > 0 && value >= -afterValue) {
						break;
					}
					afterValue = value;
					afterPosition = searchPosition;
					if (afterValue >= 0) {
						break;
					}
				}
			}
		} else {
			return position;
		}

		if (position <= 0 || direction === Direction.UP) {
			return afterPosition;
		}

		if (beforeValue > 0) {
			for (let searchPosition = position - 1; searchPosition >= 0; searchPosition--) {
				const value = data[searchPosition];
				if (value < beforeValue) {
					if (value < 0 && -value >= beforeValue) {
						break;
					}
					beforeValue = value;
					beforePosition = searchPosition;
					if (beforeValue <= 0) {
						break;
					}
				}
			}
		} else if (beforeValue < 0) {
			for (let searchPosition = position - 1; searchPosition >= 0; searchPosition--) {
				const value = data[searchPosition];
				if (value >= beforeValue) {
					if (value > 0 && value >= -beforeValue) {
						break;
					}
					beforeValue = value;
					beforePosition = searchPosition;
					if (beforeValue >= 0) {
						break;
					}
				}
			}
		}

		if (position >= length - 1 || direction === Direction.DOWN) {
			return beforePosition;
		} else if (beforePosition === 0 || afterPosition === length - 1) {
			if (Math.abs(beforeValue) < Math.abs(afterValue)) {
				return beforePosition;
			} else {
				return afterPosition;
			}
		} else if (position - beforePosition <= afterPosition - position) {
			return beforePosition;
		} else {
			return afterPosition;
		}
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
			if (this.loopEnd < to) {
				newSample.loopEnd = this.loopEnd - from;
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
		const oldLength = oldBuffer.length;
		let newLength = oldLength - deleteLength;
		if (newLength < 1) {
			newLength = 1;
		}
		const newBuffer = new AudioBuffer({
			length: newLength,
			numberOfChannels: numberOfChannels,
			sampleRate: oldBuffer.sampleRate,
		});
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const data = oldBuffer.getChannelData(channelNumber);
			const before = data.subarray(0, from);
			newBuffer.copyToChannel(before, channelNumber);
			if (to < oldLength - 1) {
				const after = data.subarray(to + 1);
				newBuffer.copyToChannel(after, channelNumber, from);
			}
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
			return [newSample, insertLength];
		});
	}

	insertSilence(silenceLength, position) {
		const oldBuffer = this.buffer;
		const oldLength = oldBuffer.length;
		const numberOfChannels = oldBuffer.numberOfChannels;
		const newBuffer = new AudioBuffer({
			length: oldLength + silenceLength,
			numberOfChannels: numberOfChannels,
			sampleRate: oldBuffer.sampleRate,
		});
		const afterPosition = position + silenceLength;
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const oldData = oldBuffer.getChannelData(channelNumber);
			const before = oldData.subarray(0, position + 1);
			newBuffer.copyToChannel(before, channelNumber);
			if (position < oldLength - 1) {
				const after = oldData.subarray(position + 1);
				newBuffer.copyToChannel(after, channelNumber, afterPosition);
			}
		}
		const newSample = new Sample(newBuffer);
		let loopStart = this.loopStart;
		if (loopStart >= position) {
			loopStart += silenceLength;
		}
		newSample.loopStart = loopStart;
		let loopEnd = this.loopEnd;
		if (loopEnd >= position && loopEnd !== Number.MAX_VALUE) {
			loopEnd += silenceLength;
		}
		newSample.loopEnd = loopEnd;
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	detectSilence(threshold, position) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (position === undefined) {
			position = length - 1;
		}
		const numberOfChannels = buffer.numberOfChannels;
		let begin = 0;
		let end = length - 1;
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const data = buffer.getChannelData(channelNumber);
			let index = position + 1;
			while (index > begin && Math.abs(data[index - 1]) < threshold) {
				index--;
			}
			if (index > begin) {
				begin = index;
			}
			index = position - 1;
			while (index < end && Math.abs(data[index + 1]) < threshold) {
				index++;
			}
			if (index < end) {
				end = index;
			}
		}
		if (begin > 0) {
			begin = this.findZero(begin, 0, Direction.UP) + 1;
		}
		if (end < length - 1) {
			end = this.findZero(end, 0, Direction.DOWN) - 1;
		}
		if (begin > end) {
			return undefined;
		} else {
			return [begin, end];
		}
	}

	mix(mixSample, position, mixLength, loop) {
		const me = this;
		const oldBuffer = this.buffer;
		const sampleRate = oldBuffer.sampleRate;
		const playbackRate = noteFrequencies[this.sampledNote] / noteFrequencies[mixSample.sampledNote];
		const mixSampleLength = sampleRate * mixSample.buffer.duration / playbackRate;
		let length;
		if (mixLength === undefined) {
			length = Math.max(oldBuffer.length, position + mixSampleLength);
			if (loop) {
				mixLength = length - position;
			} else {
				mixLength = mixSampleLength;
			}
		} else {
			length = Math.max(oldBuffer.length, position + mixLength);
		}
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			length,
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
		const endTime = (position + mixLength) / sampleRate;

		if (loop) {
			const speedRatio = mixSampleLength / mixSample.buffer.length;

			let preLoopLength;
			if (mixSample.loopStart > 0) {
				preLoopLength = mixSample.loopStart - 1;
			} else {
				preLoopLength = 0;
			}

			let loopEnd = mixSample.loopEnd;
			let releaseLength;
			if (loopEnd >= mixSample.buffer.length) {
				loopEnd = mixSample.buffer.length - 1;
				releaseLength = 0;
			} else {
				releaseLength = mixSample.buffer.length - loopEnd - 1;
			}
			const loopLength = loopEnd - preLoopLength;
			const loopingLength = mixLength - (preLoopLength + releaseLength) * speedRatio;
			const effectiveLoopLength = loopLength * speedRatio;
			let numLoops = Math.trunc(loopingLength / effectiveLoopLength);

			if (numLoops > 1) {
				const mixSampleRate = mixSample.buffer.sampleRate;
				mixSource.loop = true;
				mixSource.loopStart = mixSample.loopStart / mixSampleRate;
				mixSource.loopEnd = (loopEnd + 1) / mixSampleRate;
				const beginRelease = (position + preLoopLength * speedRatio + numLoops * effectiveLoopLength) / sampleRate;
				mixSource.stop(beginRelease);
				const releaseSource = context.createBufferSource();
				releaseSource.buffer = mixSample.buffer;
				releaseSource.playbackRate.value = playbackRate;
				releaseSource.connect(mixGain);
				releaseSource.start(beginRelease, loopEnd / mixSampleRate);
				releaseSource.stop(endTime);
			} else {
				mixSource.stop(endTime);
			}
		} else {
			mixSource.stop(endTime);
		}

		return context.startRendering().then(function (newBuffer) {
			const newSample = new Sample(newBuffer);
			newSample.loopStart = me.loopStart;
			newSample.loopEnd = me.loopEnd;
			newSample.sampledNote = me.sampledNote;
			newSample.gain = me.gain;
			return [newSample, mixLength];
		});
	}

	crossFadeLoop(changeType, length, postLength) {
		if (length > this.loopStart) {
			length = this.loopStart;
		}

		const me = this;
		const oldBuffer = this.buffer;
		const bufferLength = oldBuffer.length;
		const sampleRate = oldBuffer.sampleRate;
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			bufferLength,
			sampleRate
		);

		const loopStartTime = this.loopStart / sampleRate;
		let loopEnd = this.loopEnd;
		if (loopEnd >= bufferLength) {
			loopEnd = bufferLength - 1;
		}
		const loopEndTime = (loopEnd + 1) / sampleRate;

		const fadeTime = length / sampleRate;
		const postFadeTime = postLength / sampleRate;

		const fadeOut = context.createBufferSource();
		fadeOut.buffer = oldBuffer;
		const fadeIn = context.createBufferSource();
		fadeIn.buffer = oldBuffer;

		const fadeOutGain = context.createGain();
		fadeOut.connect(fadeOutGain);
		fadeOutGain.connect(context.destination);
		const fadeInGain = context.createGain();
		fadeIn.connect(fadeInGain);
		fadeInGain.connect(context.destination);

		const begin = loopEndTime - fadeTime;
		fadeOut.start();
		if (postLength > 0) {
			fadeIn.start(begin, loopStartTime - fadeTime);
		} else {
			fadeIn.start(begin, loopStartTime - fadeTime, fadeTime);
		}

		if (length > 0) {
			fadeInGain.gain.setValueAtTime(0, 0);
			if (changeType === ChangeType.LINEAR) {
				fadeOutGain.gain.setValueAtTime(1, begin);
				fadeOutGain.gain.linearRampToValueAtTime(0, loopEndTime);
				fadeInGain.gain.setValueAtTime(0, begin);
				fadeInGain.gain.linearRampToValueAtTime(1, loopEndTime);
			} else {
				fadeOutGain.gain.setValueCurveAtTime(sinFadeOut, begin, fadeTime);
				fadeInGain.gain.setValueCurveAtTime(sinFadeIn, begin, fadeTime);
			}
		}

		if (postLength > 0) {
			if (changeType === ChangeType.LINEAR) {
				const endTime = loopEndTime + postFadeTime;
				fadeOutGain.gain.linearRampToValueAtTime(1, endTime);
				fadeInGain.gain.linearRampToValueAtTime(0, endTime);
			} else {
				fadeOutGain.gain.setValueCurveAtTime(sinFadeIn, loopEndTime, postFadeTime);
				fadeInGain.gain.setValueCurveAtTime(sinFadeOut, loopEndTime, postFadeTime);
			}
		} else {
			fadeOutGain.gain.setValueAtTime(1, loopEndTime + SHORTEST_TIME);
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

	smooth(windowSize, from, to) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}

		const windowData = new Float32Array(windowSize);
		const halfWindowSize = Math.trunc((windowSize - 1) / 2);
		for (let channelNumber = 0; channelNumber < buffer.numberOfChannels; channelNumber++) {
			const channelData = buffer.getChannelData(channelNumber);
			let minIndex = Math.max(from - halfWindowSize, 0);
			let maxIndex = Math.min(from + halfWindowSize, length - 1);
			let windowMinIndex = 0;
			let windowMaxIndex = maxIndex - minIndex;
			let sum = 0;
			for (let i = 0; i <= windowMaxIndex; i++) {
				windowData[i] = channelData[minIndex + i] / windowSize;
				sum += windowData[i];
			}
			channelData[from] = sum * (windowSize / (maxIndex - minIndex + 1));

			for (let i = from + 1; i <= to; i++) {
				if (i - 1 - minIndex === halfWindowSize) {
					minIndex++;
					windowMinIndex = (windowMinIndex + 1) % windowSize;
				}
				if (maxIndex < length - 1) {
					maxIndex++;
					windowMaxIndex = (windowMaxIndex + 1) % windowSize;
					windowData[windowMaxIndex] = channelData[maxIndex] / windowSize;
				}
				sum = 0;
				let actualWindowSize = maxIndex - minIndex + 1;
				for (let j = 0; j < actualWindowSize; j++) {
					sum += windowData[(windowMinIndex + j) % windowSize];
				}
				channelData[i] = sum * (windowSize / actualWindowSize);
			}
		}
	}

	smoothResample(newSampleRate) {
		const me = this;
		const oldBuffer = this.buffer;
		const rateRatio = newSampleRate / oldBuffer.sampleRate;
		const context = new OfflineAudioContext(
			oldBuffer.numberOfChannels,
			Math.round(oldBuffer.length * rateRatio),
			newSampleRate
		);
		const source = context.createBufferSource();
		source.buffer = oldBuffer;
		source.connect(context.destination);
		source.start();

		return context.startRendering().then(function (newBuffer) {
			const newSample = new Sample(newBuffer);
			newSample.loopStart = Math.round(me.loopStart * rateRatio);
			if (me.loopEnd < Number.MAX_VALUE) {
				newSample.loopEnd = Math.round(me.loopEnd * rateRatio);
			}
			newSample.sampledNote = me.sampledNote;
			newSample.gain = me.gain;
			return newSample;
		});
	}

	resample(newSampleRate) {
		const me = this;
		const oldBuffer = this.buffer;
		const rateRatio = newSampleRate / oldBuffer.sampleRate;
		const newLength = Math.trunc(oldBuffer.length * rateRatio);
		const numberOfChannels = oldBuffer.numberOfChannels;
		const newBuffer = new AudioBuffer({
			length: newLength,
			numberOfChannels: numberOfChannels,
			sampleRate: newSampleRate,
		});
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const oldData = oldBuffer.getChannelData(channelNumber);
			const newData = newBuffer.getChannelData(channelNumber);
			for (let i = 0; i < newLength; i++) {
				const index = Math.round(i / rateRatio);
				newData[i] = oldData[index];
			}
		}
		const newSample = new Sample(newBuffer);
		newSample.loopStart = Math.round(this.loopStart * rateRatio);
		if (this.loopEnd < Number.MAX_VALUE) {
			newSample.loopEnd = Math.round(this.loopEnd * rateRatio);
		}
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	bitcrush(numBits, from, to) {
		const noiseShapingAmount = 0.8;
		const oldBuffer = this.buffer;
		const length = oldBuffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const numberOfChannels = oldBuffer.numberOfChannels;
		const newBuffer = new AudioBuffer({
			length: length,
			numberOfChannels: numberOfChannels,
			sampleRate: oldBuffer.sampleRate,
		});
		const numValues = 1 << numBits;
		const maxValue = numValues - 1;
		const scale = maxValue / 2;
		const midValue = numValues >> 1;
		let error = 0;
		for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
			const oldData = oldBuffer.getChannelData(channelNumber);
			const before = oldData.subarray(0, from);
			newBuffer.copyToChannel(before, channelNumber);
			const newData = newBuffer.getChannelData(channelNumber);
			for (let i = from; i <= to; i++) {
				// E.g. for 8 bit scale -1 <= oldData[i] <= 1 into the range 0 <= scaled <= 255
				const scaled = (oldData[i] + 1) * scale;
				const dither = 0.5 * Math.random() - 0.5 * Math.random();
				const sum = scaled + dither - noiseShapingAmount * error;
				let intValue = Math.floor(sum);
				if (intValue < 0) {
					intValue = 0;
				} else if (intValue > maxValue) {
					intValue = maxValue;
				}
				error = intValue - scaled;
				newData[i] =  (intValue - midValue + 0.5) / midValue;
			}
			if (to < length - 1) {
				const after = oldData.subarray(to + 1);
				newBuffer.copyToChannel(after, channelNumber, to + 1);
			}
		}
		const newSample = new Sample(newBuffer);
		newSample.loopStart = this.loopStart;
		newSample.loopEnd = this.loopEnd;
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	separateStereo(separation, from, to) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const leftChannel = buffer.getChannelData(0);
		const rightChannel = buffer.getChannelData(1);
		const midMultiplier = (1 - Math.abs(separation)) / 2;
		for (let i = from; i <= to; i++) {
			const oldLeft = leftChannel[i];
			const oldRight = rightChannel[i];
			const oldMid = oldLeft + oldRight;
			const oldSide = oldLeft - oldRight;
			const newMid = oldMid - midMultiplier * oldSide;
			const newSide = oldSide * separation;
			leftChannel[i] = (newMid + newSide) / 2;
			rightChannel[i] = (newMid - newSide) / 2;
		}
	}

	channel(channelNumber) {
		const oldBuffer = this.buffer;
		const newBuffer = new AudioBuffer({
			length: oldBuffer.length,
			numberOfChannels: 1,
			sampleRate: oldBuffer.sampleRate,
		});
		newBuffer.copyToChannel(oldBuffer.getChannelData(channelNumber), 0);
		const newSample = new Sample(newBuffer);
		newSample.loopStart = this.loopStart;
		newSample.loopEnd = this.loopEnd;
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	channels() {
		const oldBuffer = this.buffer;
		const length = oldBuffer.length;
		const numberOfChannels = oldBuffer.numberOfChannels;
		const sampleRate = oldBuffer.sampleRate;
		const samples = [];

		for (let i = 0; i < numberOfChannels; i++) {
			const newBuffer = new AudioBuffer({
				length: length,
				numberOfChannels: 1,
				sampleRate: sampleRate,
			});
			newBuffer.copyToChannel(oldBuffer.getChannelData(i), 0);
			const sample = new Sample(newBuffer);
			sample.loopStart = this.loopStart;
			sample.loopEnd = this.loopEnd;
			sample.sampledNote = this.sampledNote;
			sample.gain = this.gain;
			samples[i] = sample;
		}
		return samples;
	}

	mixToMono(balance) {
		const rightFraction = 0.5 * Math.sin(Math.PI * balance - Math.PI / 2) + 0.5;
		const leftFraction = 0.5 * Math.sin(Math.PI * balance + Math.PI / 2) + 0.5;
		const oldBuffer = this.buffer;
		const left = oldBuffer.getChannelData(0);
		const right = oldBuffer.getChannelData(1);
		const length = oldBuffer.length;
		const newBuffer = new AudioBuffer({
			length: length,
			numberOfChannels: 1,
			sampleRate: oldBuffer.sampleRate,
		});
		const mono = newBuffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			mono[i] = left[i] * leftFraction + right[i] * rightFraction;
		}
		const newSample = new Sample(newBuffer);
		newSample.loopStart = this.loopStart;
		newSample.loopEnd = this.loopEnd;
		newSample.sampledNote = this.sampledNote;
		newSample.gain = this.gain;
		return newSample;
	}

	duplicateChannel(balance, from, to) {
		const buffer = this.buffer;
		const length = buffer.length;
		if (to === undefined) {
			to = length - 1;
			if (from === undefined) {
				from = 0;
			}
		}
		const rightFraction = 0.5 * Math.sin(Math.PI * balance - Math.PI / 2) + 0.5;
		const leftFraction = 0.5 * Math.sin(Math.PI * balance + Math.PI / 2) + 0.5;
		const left = buffer.getChannelData(0);
		const right = buffer.getChannelData(1);
		for (let i = from; i <= to; i++) {
			left[i] = left[i] * leftFraction + right[i] * rightFraction;
		}
		const mixed = left.subarray(from, to + 1);
		buffer.copyToChannel(mixed, 1, from);
	}

	offsetAtTime(time, snapToZero) {
		const buffer = this.buffer;
		let offset;
		if (time >= 0) {
			offset = buffer.sampleRate * time;
		} else {
			offset = buffer.length + buffer.sampleRate * time;
		}
		if (snapToZero) {
			offset = this.findZero(offset, 0);
		}
		return offset;
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
			loopEnd = (loopEnd + 1) / buffer.sampleRate;
		}
		bufferNode.loopEnd = loopEnd;
		this.duration = buffer.duration;
		this.samplePeriod = 1 / noteFrequencies[sample.sampledNote];
		this.gain = sample.gain;
	}
}

class Instrument {
	constructor(name) {
		this.name = name;
		this.tempoAutomations = new Map();
		this.defaultOctave = 4;	// The octave that should be mapped to the keys qwerty...
	}

	get sampled() {
		return false;
	}
}

class SampledInstrument extends Instrument {

	constructor(name) {
		super(name);
		this.samples = [];
		this.startingNotes = [];
	}

	get sampled() {
		return true;
	}

	addSample(startingNote, sample, preserveDetails) {
		const numExistingSamples = this.startingNotes.length;
		let i;
		for (i = 0; i < numExistingSamples; i++) {
			const currentNote = this.startingNotes[i];
			if (currentNote === startingNote) {
				if (preserveDetails) {
					this.samples[i].buffer = sample.buffer;
				} else {
					this.samples[i] = sample;
				}
				return;	// EARLY RETURN
			} else if (currentNote > startingNote) {
				break;
			}
		}
		this.samples.splice(i, 0, sample);
		this.startingNotes.splice(i, 0, startingNote);
		this.guessOctave();
	}

	removeSample(index) {
		this.samples.splice(index, 1);
		this.startingNotes.splice(index, 1);
		this.guessOctave();
	}

	setSampledNote(sampleNumber, noteNumber) {
		this.samples[sampleNumber].sampledNote = noteNumber;
		this.guessOctave();
	}

	setStartingNote(sampleNumber, startingNote) {
		this.samples.splice(index, 1);
		const sample = this.startingNotes.splice(index, 1)[0];
		this.addSample(startingNote, sample, false);
	}

	guessOctave() {
		const numSamples = this.samples.length;
		if (numSamples === 1) {
			this.defaultOctave = Math.round(Math.max(this.samples[0].sampledNote, this.startingNotes[0]) / 12) - 2;
		} else if (numSamples > 0) {
			// Try to find two samples one octave apart and near Octave 4.
			let octaveSet = false;
			let prevOctave = Math.round(Math.max(this.samples[0].sampledNote, this.startingNotes[0]) / 12) - 2;
			let distanceFromMiddle;
			for (let i = 1; i < numSamples; i++) {
				const octave = Math.round(Math.max(this.samples[i].sampledNote, this.startingNotes[i]) / 12) - 2;
				if (octave === prevOctave + 1 || octave === prevOctave) {
					const newDistanceFromMiddle = Math.abs(octave - 4);
					if (octaveSet && newDistanceFromMiddle > distanceFromMiddle) {
						break;
					}
					this.defaultOctave = octave;
					octaveSet = true;
					distanceFromMiddle = newDistanceFromMiddle;
				}
			}
		}
	}

	getSamplePlayer(audioContext, note) {
		let i = this.startingNotes.length;
		if (i === 0) {
			return new SamplePlayer(audioContext, Sample.EMPTY_SAMPLE);
		}
		i--;
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

	peakAmplitude() {
		let max = 0;
		for (let sample of this.samples) {
			const amplitude = sample.peakAmplitude();
			if (amplitude > max) {
				max = amplitude;
			}
		}
		return max;
	}

	removeOffset() {
		for (let sample of this.samples) {
			sample.removeOffset();
		}
	}

	normalize() {
		let max = 0;
		for (let sample of this.samples) {
			const amplitude = sample.peakAmplitude();
			if (amplitude > max) {
				max = amplitude;
			}
		}
		for (let sample of this.samples) {
			sample.gain = sample.gain / max;
		}
	}

	amplify(gain) {
		for (let sample of this.samples) {
			sample.gain *= gain;
		}
	}

	chord(intervals, instrumentNoteFreqs) {
		const me = this;
		const newInstrument = new SampledInstrument(this.name + ' chord');
		newInstrument.startingNotes = this.startingNotes.slice();

		function makeChord(sampleIndex) {
			return me.samples[sampleIndex].chord(intervals, instrumentNoteFreqs).then(function (newSample) {
				newInstrument.samples[sampleIndex] = newSample;
			});
		}

		const numSamples = this.samples.length;
		const promises = [];
		for (let sampleIndex = 0; sampleIndex < numSamples; sampleIndex++) {
			promises.push(makeChord(sampleIndex));
		}

		return Promise.all(promises).then(function () {
			newInstrument.removeOffset();
			const amplitude = newInstrument.peakAmplitude();
			if (amplitude > 1) {
				newInstrument.amplify(1 / amplitude);
			}
			return newInstrument;
		});
	}

	separateStereo(separation) {
		for (let sample of this.samples) {
			sample.separateStereo(separation);
		}
	}

	mixToMono() {
		const samples = this.samples;
		for (let i = 0; i < samples.length; i++) {
			samples[i] = samples[i].mixToMono();
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
						sample.autotune();
						me.addSample(startingNote, sample, true);
			  			resolve(new Resource(url, sample));

			  		}).catch(function (error) {
						const sample = new Sample(decodeSampleData(arrCopy));
						sample.autotune();
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
				const arr = this.result;
				const arrCopy = arr.slice(0);
		  		audioContext.decodeAudioData(arr)
		  		.then(function(buffer) {
					const sample = new Sample(buffer);
					sample.autotune();
					me.addSample(startingNote, sample, true);
		  			resolve(new Resource(file, sample));

		  		}).catch(function (error) {
					const sample = new Sample(decodeSampleData(arrCopy));
					sample.autotune();
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
		this.audioContext = audioContext;
		const sampleRate = audioContext.sampleRate;
		this.sampleRate = sampleRate;
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

		const noiseLength = 3; // in seconds
		const noiseBuffer = audioContext.createBuffer(1, noiseLength * sampleRate, sampleRate);
		fillNoise(noiseBuffer);
		const noise = audioContext.createBufferSource();
		this.noise = noise;
		noise.buffer = noiseBuffer;
		noise.loop = true;
		noise.loopEnd = noiseLength;

		this.masterMetronomeBuffer = undefined;
		this.metronomeBuffer = undefined;
		this.metronomeGroove = [];
		this.metronomeNode = undefined;

		this.changeTimes = new Map();
		this.audioParamValues = new Map();
		this.patternBeginTime = 0;

		downloadArrayBuffer('samples/metronome.wav')
		.then(function (resource) {
			audioContext.decodeAudioData(resource.data)
			.then(function (buffer) {
				me.masterMetronomeBuffer = buffer;
				me.metronomeBuffer = buffer;
				me.metronomePeriod = buffer.duration;
			});
		});

		audioContext.audioWorklet.addModule(PATH + 'audioworkletprocessors.js').then(function () {
			if (callback !== undefined) {
				callback(me);
			}
		});
	}

	makeChange(audioParam, changeType, value, time, now) {
		switch (changeType) {
		case ChangeType.SET: {
			audioParam.setValueAtTime(value, time);
			break;
		}

		case ChangeType.LINEAR: {
			const prevTime = this.changeTimes.get(audioParam);
			if (prevTime === undefined) {
				let oldValue = this.audioParamValues.get(audioParam);
				if (oldValue === undefined) {
					oldValue = audioParam.value;
				}
				audioParam.setValueAtTime(oldValue, this.patternBeginTime);
			}
			audioParam.linearRampToValueAtTime(value, time);
			break;
		}

		case ChangeType.EXPONENTIAL: {
			const timeDifference = time - now;
			if (timeDifference <= 0) {
				audioParam.value = value;
			} else {
				let prevTime = this.changeTimes.get(audioParam);
				if (prevTime === undefined) {
					prevTime = this.patternBeginTime;
				}
				if (prevTime <= now) {
					audioParam.setTargetAtTime(value, now, timeDifference / 5);
					audioParam.setValueAtTime(value, time);
				} else {
					const timeSpan = time - prevTime;
					audioParam.setTargetAtTime(value, prevTime + SHORTEST_TIME, timeSpan / 5);
					audioParam.setValueAtTime(value, time);
				}
			}
			break;
		}

		default:
			throw new Error('Unknown Change Type ' + changeType);
		}
		this.changeTimes.set(audioParam, time);
		this.audioParamValues.set(audioParam, value);
	}

	disposeAudioParam(audioParam) {
		this.changeTimes.delete(audioParam);
		this.audioParamValues.delete(audioParam);
	}

	beginPattern(step) {
		this.patternBeginTime = this.startTime + step * TIME_STEP;
		this.changeTimes = new Map();
	}

	stop() {
		for (let audioParam of this.changeTimes.keys()) {
			audioParam.cancelScheduledValues(0);
		}
		for (let channel of this.channels) {
			channel.stop();
		}
		this.changeTimes = new Map();
		this.audioParamValues = new Map();
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
			return 6;
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
		this.noise.start(when);
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

	metronome(groove, linesPerBeat) {
		this.metronomeOff();

		const grooveLength = groove.length;
		const rhythmLength = lcm(grooveLength, linesPerBeat);
		const beats = [];
		for (let i = 0; i < rhythmLength; i += linesPerBeat) {
			let beatLength = 0;
			for (let j = i; j < i + linesPerBeat; j++) {
				beatLength += groove[j % grooveLength];
			}
			beats.push(beatLength);
		}
		console.log(beats);

		if (!equalValues(beats, this.metronomeGroove)) {
			const masterBuffer = this.masterMetronomeBuffer;
			const numberOfChannels = masterBuffer.numberOfChannels;
			const sampleRate = masterBuffer.sampleRate;
			let length = 0;
			for (let lineTime of beats) {
				length += Math.round(lineTime * TIME_STEP * sampleRate);
			}
			const buffer = new AudioBuffer({
				length: length,
				numberOfChannels: numberOfChannels,
				sampleRate: sampleRate,
			});
			for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
				const data = masterBuffer.getChannelData(channelNumber);
				let startOffset = 0;
				for (let lineTime of beats) {
					const clipLength = Math.round(lineTime * TIME_STEP * sampleRate);
					const clip = data.subarray(0, clipLength);
					buffer.copyToChannel(clip, channelNumber, startOffset);
					startOffset += clipLength;
				}
			}
			this.metronomeBuffer = buffer;
			this.metronomeGroove = beats.slice();
		}
		const node = this.audioContext.createBufferSource();
		node.buffer = this.metronomeBuffer;
		node.loopEnd = Number.MAX_VALUE;
		node.loop = true;
		node.connect(this.volume);
		node.start();
		this.metronomeNode = node;
	}

	metronomeOff() {
		const oldNode = this.metronomeNode;
		if (oldNode !== undefined) {
			oldNode.stop();
			oldNode.disconnect();
			this.metronomeNode = undefined;
		}
	}

	get metronomeRunning() {
		return this.metronomeNode !== undefined;
	}

	set(parameterNumber, value, delay, changeType, channelNumber) {
		let time = this.nextStep();
		if (delay !== undefined) {
			time += delay;
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
		parameterMap.set(Parameter.MACRO, [new MacroChange(changeType, macro, value)]);
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
		super(context, 'wavetable', {
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
		super(context, 'reciprocal', {
			channelCount: 1,
			channelCountMode: 'explicit',
		});
	}
}

class SampleAndHoldNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'sample-and-hold', {
			channelCount: 1,
			channelCountMode: 'explicit',
		});
	}

	get sampleRate() {
		return this.parameters.get('sampleRate');
	}
}

class Channel {
	constructor(system) {
		const audioContext = system.audioContext;
		const now = audioContext.currentTime;
		this.system = system;
		this.parameters = [
			system.lineTime, // line time (125bpm, allegro)
			[],		// groove
			4,		// increment groove step every 4 lines
			undefined, // actual macro values are held in macroValues property
			0,		// no instrument set
			[69],	// MIDI note numbers
			[0, 15, 17, 32],		// custom waveform
			[-1, 0.125, -0.125, 1],
			127,	// velocity
			2,		// attack
			0.5,	// attack curve
			0,		// hold
			50,		// decay
			ChangeType.LINEAR,	// decay shape
			70,		// sustain
			150,	// release
			ChangeType.LINEAR, // release shape
			0,		// set duration to automatic
			0,		// samples don't use the envelope
			0.5,	// glide time in lines
			Gate.CLOSED, // gate
			Wave.TRIANGLE,	// waveform
			Wave.TRIANGLE,	// minimum wavetable position
			Wave.TRIANGLE,	// maximum wavetable position
			0,		// wavetable position uses LFO 1
			0,		// oscillator tuning separation
			440,	// frequency
			0,		// detune
			0,		// no stretched tuning
			8,		// 8 times as many noise samples per second as the oscillator pitch
			'sine',	// LFO 1 shape
			5,		// LFO 1 rate
			0,		// LFO 1 phase
			100,	// LFO 1 gain
			0,		// LFO 1 delay
			0,		// LFO 2 attack
			1,		// LFO 1 at a constant frequency
			Direction.UP, // LFO 1 fades up (when an attack is set)
			0,		// LFO 1 doesn't retrigger
			'sine',	// LFO 2 shape
			5,		// LFO 2 rate
			0,		// LFO 2 phase
			100,	// LFO 2 gain
			0,		// LFO 2 delay
			0,		// LFO 2 attack
			1,		// LFO 2 at a constant frequency
			Direction.UP, // LFO 2 fades up (when an attack is set)
			0,		// LFO 2 doesn't retrigger
			0,		// vibrato uses LFO 1
			0,		// vibrato extent
			0,		// siren extent
			100,	//	volume
			0,		// tremolo uses LFO 1
			0,		// tremolo amount
			0,		// pan
			0,		// leftmost pan change
			0,		// rightmost pan change
			0,		// pan LFO
			50,		// pulse width
			50,		// min pulse width
			50,		// max pulse width
			0,		// PWM uses LFO 1
			'lowpass', // filter type
			4400,	// filter frequency
			4400,	// minimum filter frequency
			4400,	// maximum filter frequency
			0,		// filter frequency uses LFO 1
			1,		// filter Q
			1,		// min filter Q
			1,		// max filter Q
			0,		// Q uses LFO 1
			0,		// Cutoff frequency and Q both use LFO 1
			0,		// filter gain
			100,	// filter fully enabled
			0,		// filter fully enabled
			0, 		// no delay
			0,		// no delay
			0,		// no delay
			0,		// delay uses LFO 1
			100,	// delay mix
			0,		// feedback
			0,		// ring modulation
			system.ticksPerLine, // number of ticks for broken chords, glissando and retrigger
			0,		// number of ticks to delay
			0,		// no rest time afterwards
			0,		// retrigger time (ticks)
			0,		// don't use multi-trigger
			100,	// retrigger volume same as initial volume
			2,		// broken chord speed
			Chord.TO_AND_FRO_2,	// chord pattern
			0,		// glissando length (in semitones)
			system.ticksPerLine, // glissando time (in ticks)
			0,		// no sample offset
			1,		// envelope scaling for AHD portion of the envelope
		];
		this.usingOscillator = true;
		this.instrument = undefined;
		this.samplePlayer = undefined;
		this.sampleLoopEndTime = undefined;
		this.velocity = 1;
		this.sustain = expCurve(70, 1); // combined sustain and velocity
		this.release = 0.3;
		this.calcEnvelope();
		this.grooveLineCount = 0;
		this.macroValues = new Map();
		this.timeouts = new Set();

		// State information for processing chords
		this.frequencies = [440];
		this.detune = 1; // i.e. no detuning, actual frequency = notional frequency
		this.noteFrequencies = system.getNotes(0);
		this.grooveIndex = 0;
		this.prevLineTime = this.parameters[Parameter.LINE_TIME];
		this.retriggerVolumeChangeType = ChangeType.SET;
		this.noteIndex = 0;
		this.chordDir = 1;
		this.noteRepeated = false;
		this.noteChangeType = ChangeType.SET;
		this.glissandoStepsDone = 0;
		this.tickCounter = 0;
		this.tickModulus = 1;
		this.scheduledUntil = 0;

		// LFOs
		const lfo1 = new LFO(system);
		this.lfo1 = lfo1;
		const lfo2 = new LFO(system);
		this.lfo2 = lfo2;

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
		sawGain.connect(wavetable, 0, 2);
		shaper.connect(wavetable, 0, 3);
		const oscillatorGain = audioContext.createGain();
		this.oscillatorGain = oscillatorGain;
		wavetable.connect(oscillatorGain);
		const wavetableMod = new Modulator(system, lfo1, lfo2, wavetable.position);
		this.wavetableMod = wavetableMod;
		wavetableMod.setMinMax(ChangeType.SET, Wave.TRIANGLE, Wave.TRIANGLE, now, now);
		triangleGain.gain.value = 0.7;
		sawGain.gain.value = 0.3;

		// Pulse width modulation
		const pwmDetune = audioContext.createGain();
		this.pwmDetune = pwmDetune;
		const reciprocal = new ReciprocalNode(audioContext);
		pwmDetune.connect(reciprocal);
		const dutyCycle = audioContext.createGain();
		reciprocal.connect(dutyCycle);
		const pwm = new Modulator(system, lfo1, lfo2, dutyCycle.gain);
		this.pwm = pwm;
		pwm.setMinMax(ChangeType.SET, 0.5, 0.5, now, now);
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
		const playRateMultiplier = audioContext.createGain();
		playRateMultiplier.gain.value = 1 / 440;
		this.playRateMultiplier = playRateMultiplier;
		const frequencyNode = audioContext.createConstantSource();
		/* The vibrato feeds a varying frequency into this, which divides by the central
		 * frequency to compute the playback speed.
		 */
		 this.frequencyNode = frequencyNode;
		frequencyNode.connect(playRateMultiplier);
		// Also use the frequency to compute pulse the pulse width.
		frequencyNode.connect(pwmDetune);

		// Noise
		const sampleAndHold = new SampleAndHoldNode(audioContext);
		this.sampleAndHold = sampleAndHold;
		system.noise.connect(sampleAndHold);
		const noiseGain = audioContext.createGain();
		this.noiseGain = noiseGain;
		noiseGain.gain.value = 0;
		sampleAndHold.connect(noiseGain);
		const sampleAndHoldRateMultiplier = audioContext.createGain();
		this.sampleAndHoldRateMultiplier = sampleAndHoldRateMultiplier;
		sampleAndHoldRateMultiplier.gain.value = 0;
		frequencyNode.connect(sampleAndHoldRateMultiplier);
		sampleAndHoldRateMultiplier.connect(sampleAndHold.sampleRate);

		// Vibrato
		const vibrato = new Modulator(system, lfo1, lfo2);
		this.vibrato = vibrato;
		vibrato.connect(sine.frequency);
		vibrato.connect(triangle.frequency);
		vibrato.connect(saw.frequency);
		vibrato.connect(frequencyNode.offset);

		// Siren
		const siren = new Modulator(system, lfo1, lfo2);
		siren.setBalance(ChangeType.SET, 1, audioContext.currentTime);
		this.siren = siren;
		siren.connect(sine.frequency);
		siren.connect(triangle.frequency);
		siren.connect(saw.frequency);
		siren.connect(frequencyNode.offset);

		// Filter
		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;
		oscillatorGain.connect(filter);
		noiseGain.connect(filter);
		sampleGain.connect(filter);

		// Filter modulation
		const filterFrequencyMod = new Modulator(system, lfo1, lfo2, filter.frequency);
		this.filterFrequencyMod = filterFrequencyMod;
		const filterQMod = new Modulator(system, lfo1, lfo2, filter.Q);
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
		noiseGain.connect(unfilteredPath);
		sampleGain.connect(unfilteredPath);

		// Ring modulation
		const ringMod = audioContext.createGain();
		const ringInput = audioContext.createGain();
		ringInput.connect(ringMod.gain);
		ringInput.gain.value = 0;
		this.ringMod = ringMod;
		this.ringInput = ringInput;
		filteredPath.connect(ringMod);
		unfilteredPath.connect(ringMod);
		this.hasConnection = false;

		// Envelope
		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;
		ringMod.connect(envelope);

		// Tremolo
		const tremoloGain = audioContext.createGain();
		const tremoloModulator = new Modulator(system, lfo1, lfo2, tremoloGain.gain);
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
		const flanger = new Modulator(system, lfo1, lfo2, delay.delayTime);
		this.flanger = flanger;

		// Panning
		const panner = audioContext.createStereoPanner();
		this.panner = panner;
		delayOutput.connect(panner);
		const panMod = new Modulator(system, lfo1, lfo2, panner.pan);
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
		channel.hasConnection = true;
	}

	start(when) {
		if (!this.started) {
			this.sine.start(when);
			this.triangle.start(when);
			this.saw.start(when);
			this.lfo1.start(when);
			this.lfo2.start(when);
			this.frequencyNode.start(when);
			this.started = true;
		}
	}

	stop() {
		/* These audio parameters are not directly controlled by the user and hence aren't
		 * covered by makeChange.
		 * LFO.delayNode.delayTime
		 * LFO.envelope.gain
		 * playRateMultiplier.gain
		 * sampleGain.gain
		 * sampleAndHold.sampleRate
		 * envelope.gain
		 */
		const now = this.system.audioContext.currentTime;
		this.lfo1.stopChanges();
		this.lfo2.stopChanges();
		this.playRateMultiplier.gain.cancelScheduledValues(0);
		this.sampleGain.gain.cancelScheduledValues(0);
		this.sampleGain.gain.value = 0;
		this.noiseOff(ChangeType.SET, now, now);
		this.envelope.gain.cancelScheduledValues(0);
		this.envelope.gain.value = 0;
		for (let id of this.timeouts) {
			clearTimeout(id);
		}
		this.timeouts = new Map();
	}

	setTimeout(func, time, now) {
		const delay = Math.round((time - now) * 1000);
		const id = setTimeout(func, delay);
		this.timeouts.add(id);
		return id;
	}

	timeoutComplete(id) {
		this.timeouts.delete(id);
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
		const samplePlayer = this.instrument.getSamplePlayer(this.system.audioContext, note);
		this.playRateMultiplier.gain.setValueAtTime(samplePlayer.samplePeriod, time);
		const sampleBufferNode = samplePlayer.bufferNode;
		this.playRateMultiplier.connect(sampleBufferNode.playbackRate);
		sampleBufferNode.connect(this.sampleGain);

		this.sampleGain.gain.setValueAtTime(samplePlayer.gain, time);
		const offset = parameters[Parameter.OFFSET] / 256 * samplePlayer.duration;
		sampleBufferNode.start(time, offset);
		this.sampleBufferNode = sampleBufferNode;
		this.samplePlayer = samplePlayer;
		const loopEndTime = time + (sampleBufferNode.loopEnd - offset) / (samplePlayer.samplePeriod * this.noteFrequencies[note]);
		if (loopEndTime > time) {
			sampleBufferNode.loop = true;
			this.sampleLoopEndTime = loopEndTime;
		} else {
			this.sampleLoopEndTime = 0;
		}
	}

	stopSample(note, time) {
		const bufferNode = this.sampleBufferNode;
		if (bufferNode === undefined) {
			return;
		}
		if (!bufferNode.loop) {
			return;
		}
		if (time <= this.sampleLoopEndTime) {
			bufferNode.loop = false;
			return;
		}

		const playbackRate = this.samplePlayer.samplePeriod * this.noteFrequencies[note];
		const loopTime = (bufferNode.loopEnd - bufferNode.loopStart) / playbackRate;
		const loopingTime = time - this.sampleLoopEndTime;
		const loops = Math.ceil(loopingTime / loopTime);
		const stopTime = this.sampleLoopEndTime + loops * loopTime;
		if (bufferNode.loopEnd < bufferNode.buffer.duration) {
			const releaseNode = this.system.audioContext.createBufferSource();
			releaseNode.buffer = bufferNode.buffer;
			releaseNode.playbackRate.value = 0;
			this.playRateMultiplier.connect(releaseNode.playbackRate);
			releaseNode.connect(this.sampleGain);
			releaseNode.start(stopTime, bufferNode.loopEnd);
			this.sampleBufferNode = releaseNode;
		}
		bufferNode.stop(stopTime);
	}

	triggerLFOs(when) {
		this.lfo1.trigger(when);
		this.lfo2.trigger(when);
	}

	noiseOn(changeType, time, now) {
		const noiseTracking = this.parameters[Parameter.NOISE_TRACKING];
		if (noiseTracking > 0) {
			this.sampleAndHold.sampleRate.setValueAtTime(0, time);
			this.system.makeChange(this.sampleAndHoldRateMultiplier.gain, ChangeType.SET, noiseTracking, time);
			this.system.makeChange(this.noiseGain.gain, ChangeType.SET, 1, time);
		} else {
			this.system.makeChange(this.noiseGain.gain, changeType, 1, time, now);
		}
	}

	noiseOff(changeType, time, now) {
		const noiseTracking = this.parameters[Parameter.NOISE_TRACKING];
		if (noiseTracking > 0) {
			const sampleRate = this.system.sampleRate;
			this.system.makeChange(this.sampleAndHoldRateMultiplier.gain, ChangeType.SET, 0, time);
			this.sampleAndHold.sampleRate.setValueAtTime(sampleRate, time);
			this.system.makeChange(this.noiseGain.gain, ChangeType.SET, 0, time);
		} else {
			this.system.makeChange(this.noiseGain.gain, changeType, 0, time, now);
		}
	}

	gate(state, note, volume, sustainLevel, lineTime, start) {
		const parameters = this.parameters;
		const gain = this.envelope.gain;

		let usingSamples = this.instrument && this.instrument.sampled;
		if (usingSamples) {
			if (this.usingOscillator) {
				if ((state & Gate.OPEN) === 0) {
					usingSamples = false;
				} else {
					// First time the gate's been opened since switching into sample mode.
					this.system.makeChange(this.oscillatorGain.gain, ChangeType.SET, 0, start);
					this.noiseOff(ChangeType.SET, start);
					this.usingOscillator = false;
				}
			}
		} else if (!this.usingOscillator) {
			if ((state & Gate.OPEN) === 0) {
				usingSamples = true;
			} else {
				// First time the gate's been opened since switching into oscillator mode.
				if ((state & Gate.LEGATO) === 0) {
					this.sampleGain.gain.setValueAtTime(0, start);
				}
				if (parameters[Parameter.WAVEFORM] === Wave.NOISE) {
					this.noiseOn(ChangeType.SET, start);
				} else {
					this.system.makeChange(this.oscillatorGain.gain, ChangeType.SET, 1, start);
				}
				this.usingOscillator = true;
			}
		}

		const scaleAHD = parameters[Parameter.SCALE_AHD];
		const endAttack = start + scaleAHD * this.endAttack;
		const attackConstant = this.attackConstant * scaleAHD;
		const decayShape = changeMethod[parameters[Parameter.DECAY_SHAPE]];
		const duration = parameters[Parameter.DURATION] * lineTime * TIME_STEP;
		const releaseTime = this.release;
		let endHold, endDecay, beginRelease, endTime;
		const releaseConstant = 4;

		if ((state & Gate.LEGATO) === 0) {
			gain.cancelAndHoldAtTime(start - TRIGGER_TIME);
			gain.setTargetAtTime(0, start - TRIGGER_TIME, TRIGGER_TIME / 3);
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
			endHold = start + scaleAHD * parameters[Parameter.HOLD] / 1000;
			endDecay = endHold + scaleAHD * parameters[Parameter.DECAY] / 1000;
			switch (state) {
			case Gate.OPEN:
			case Gate.REOPEN:
				this.triggerLFOs(start);
				this.playSample(note, start);
				if (parameters[Parameter.SAMPLE_DECAY]) {
					gain.setValueAtTime(volume, endHold);
					gain[decayShape](sustainLevel, endDecay);
				}
				break;

			case Gate.CLOSED:
				this.stopSample(note, start);
				break;

			case Gate.TRIGGER:
			case Gate.LEGATO_TRIGGER:
				this.triggerLFOs(start);
				this.playSample(note, start);
				if (parameters[Parameter.SAMPLE_DECAY]) {
					gain.setValueAtTime(volume, endHold);
					gain[decayShape](sustainLevel, endDecay);
				}
				beginRelease = start + duration;
				this.stopSample(note, beginRelease);
				break;

			case Gate.CUT:
				if (this.sampleBufferNode !== undefined) {
					this.sampleBufferNode.stop(start);
					this.sampleBufferNode = undefined;
				}
				break;
			}
			return;
		} // end if using samples

		switch (state) {
		case Gate.OPEN:
		case Gate.REOPEN:
			this.triggerLFOs(start);
			gain.setValueAtTime(volume, start + scaleAHD * this.endHold);
			gain[decayShape](sustainLevel, start + scaleAHD * this.endDecay);
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
		case Gate.LEGATO_TRIGGER:
			this.triggerLFOs(start);
			endHold = start + scaleAHD * this.endHold;
			endDecay = start + scaleAHD * this.endDecay;
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
			gain[decayShape](sustainLevel, endDecay);
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
			}
			break;
		}
	}

	setFrequency(changeType, frequency, when, now) {
		frequency = frequency * this.detune;
		const vibratoExtent = CENT ** (this.parameters[Parameter.VIBRATO_EXTENT] / 2);
		this.vibrato.cancelAndHoldAtTime(when);
		this.vibrato.setMinMax(changeType, frequency / vibratoExtent, frequency * vibratoExtent, when, now);
		const sirenExtent = SEMITONE ** (this.parameters[Parameter.SIREN_EXTENT] / 2);
		this.siren.cancelAndHoldAtTime(when);
		// The siren's waveform is inverted, so it's still interesting when siren and vibrato use the same LFO.
		this.siren.setMinMax(changeType, frequency * sirenExtent, frequency / sirenExtent, when, now);
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
		parameterMap = new Map(parameterMap);
		const parameters = this.parameters;
		const callbacks = [];

		const macroChanges = parameterMap.get(Parameter.MACRO);
		if (macroChanges !== undefined) {
			for (let macroChange of macroChanges) {
				const macro = macroChange.macro;
				let oldMacroValue = this.macroValues.get(macro);
				if (oldMacroValue === undefined) {
					oldMacroValue = 0;
				}
				const [changeType, newMacroValue] = calculateParameterValue(macroChange, oldMacroValue, false);
				this.macroValues.set(macro, newMacroValue);
				const changes = macro.changes(changeType, newMacroValue);
				for (let [paramNumber, change] of changes) {
					const explicitChange = parameterMap.get(paramNumber);
					if (explicitChange === undefined || explicitChange.type === ChangeType.MARK) {
						parameterMap.set(paramNumber, change);
					}
				}
			}
		}

		let gate = parameterMap.get(Parameter.GATE);
		if (gate !== undefined) {
			gate = gate.value;
		}

		let groove, grooveIndex, numTempos, grooveLineCount, lineTime;
		const grooveChange = parameterMap.get(Parameter.GROOVE);
		if (grooveChange === undefined) {
			groove = parameters[Parameter.GROOVE];
			grooveIndex = this.grooveIndex;
			numTempos = groove.length;
			if (grooveIndex >= numTempos) {
				grooveIndex = 0;
			}
			grooveLineCount = this.grooveLineCount;
		} else {
			groove = calculateParameterValue(grooveChange, parameters[Parameter.GROOVE], true)[1];
			parameters[Parameter.GROOVE] = groove;
			grooveIndex = 0;
			numTempos = groove.length;
			grooveLineCount = 0;
		}
		const grooveSpeedChange = parameterMap.get(Parameter.GROOVE_SPEED);
		let grooveSpeed = parameters[Parameter.GROOVE_SPEED];
		if (grooveSpeedChange !== undefined) {
			grooveSpeed = calculateParameterValue(grooveSpeedChange, grooveSpeed, false)[1];
			parameters[Parameter.GROOVE_SPEED] = grooveSpeed;
			if (grooveLineCount >= grooveSpeed && grooveChange === undefined && numTempos > 0) {
				grooveLineCount = 0;
				grooveIndex = (grooveIndex + 1) % numTempos;
				this.grooveIndex = grooveIndex;
			}
		}

		const lineTimeChange = parameterMap.get(Parameter.LINE_TIME);
		if (lineTimeChange !== undefined) {
			lineTime = calculateParameterValue(lineTimeChange, lineTime, false)[1];
			parameters[Parameter.LINE_TIME] = lineTime;
			const multiplier = lineTime / Math.max(...groove);
			for (let i = 0; i < groove.length; i++) {
				groove[i] = groove[i] * multiplier;
			}
		}

		if (numTempos === 0) {
			lineTime = parameters[Parameter.LINE_TIME];
		} else {
			lineTime = groove[grooveIndex];
			if (newLine) {
				grooveLineCount = (grooveLineCount + 1) % grooveSpeed;
				if (grooveLineCount === 0) {
					this.grooveIndex = (grooveIndex + 1) % numTempos;
				}
			}
		}
		this.grooveLineCount = grooveLineCount;

		let numTicks = calculateParameterValue(parameterMap.get(Parameter.TICKS), parameters[Parameter.TICKS], false)[1];
		if (numTicks < 1) {
			numTicks = 1;
		}

		const tickTime = (lineTime * TIME_STEP) / numTicks;
		const now = this.system.audioContext.currentTime;

		if (step === undefined) {
			step = (
				Math.max(now + 0.002 + TRIGGER_TIME, this.scheduledUntil) -
				this.system.startTime
			) / TIME_STEP;
		}
		let delay, tickOffset;
		if (gate === undefined && (parameters[Parameter.GATE] & Gate.TRIGGER) === Gate.OPEN) {
			tickOffset = this.tickCounter;
			delay = 1 - (tickOffset - Math.trunc(tickOffset));
			if (delay === 1) delay = 0;
			tickOffset = Math.ceil(tickOffset);
			this.tickCounter = tickOffset;
		} else {
			delay = calculateParameterValue(parameterMap.get(Parameter.DELAY_TICKS), parameters[Parameter.DELAY_TICKS], false)[1];
		}
		const time = this.system.startTime + step * TIME_STEP + delay * tickTime;

		let instrument;
		const instrumentChange = parameterMap.get(Parameter.INSTRUMENT);
		if (instrumentChange !== undefined) {
			const instrumentNumber = calculateParameterValue(instrumentChange, parameters[Parameter.INSTRUMENT], false)[1];
			parameters[Parameter.INSTRUMENT] = instrumentNumber;
			instrument = this.system.instruments[instrumentNumber - 1];
			this.instrument = instrument;
			if (!instrument || !instrument.sampled) {
				// Switch to oscillator
				this.stopSample(parameters[Parameter.NOTES][0], time);
			}
			const currentGate = parameters[Parameter.GATE];
			if (gate === undefined && (currentGate & Gate.TRIGGER) === Gate.OPEN) {
				gate = currentGate;
			}
			if (instrument) {
				for (let automation of instrument.tempoAutomations.values()) {
					automation.initialize();
				}
			}
		} else {
			instrument = this.instrument;
		}

		if (instrument) {
			const newLineTime = lineTime !== this.prevLineTime || instrumentChange;
			for (let [paramNumber, automation] of instrument.tempoAutomations) {
				const change = parameterMap.get(paramNumber);
				if (newLineTime || change !== undefined) {
					const scaledChange = automation.getValue(change, lineTime);
					parameterMap.set(paramNumber, scaledChange);
				}
			}
		}

		// Each of these holds a change type (or undefined for no change)
		let dirtyWavetable, dirtyPWM, dirtyFilterFrequency, dirtyFilterQ;
		let dirtyMix, dirtyDelay, dirtyPan;

		let dirtyNotes = false;
		let dirtyEnvelope = false;
		let dirtySustain = false;
		let dirtyCustomWave = false;
		let dirtyTickEvents = false;
		let endRetrigger = false;

		for (let [paramNumber, change] of parameterMap) {
			if (paramNumber <= Parameter.INSTRUMENT) {
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
					let [changeType, value] = calculateParameterValue(machineChange, currentValue, arrayParam);
					machineParams[machineParamNum] = value;
					machineChanges.push(new MachineChange(machine, machineParamNum, changeType, value));
				}
				for (let machine of machines) {
					machine.setParameters(machineChanges, time, callbacks);
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

			case Parameter.VELOCITY:
				this.velocity = expCurve(value / 1.27, 1);
				dirtySustain = true;
				break;

			case Parameter.SUSTAIN:
				dirtySustain = true;
				break;

			case Parameter.SAMPLE_DECAY:
				value = Math.trunc(Math.abs(value)) % 2;
				parameters[Parameter.SAMPLE_DECAY] = value;
				break;

			case Parameter.WAVEFORM:
				if (value === Wave.NOISE) {
					this.system.makeChange(this.oscillatorGain.gain, changeType, 0, time, now);
					if (this.usingOscillator) {
						this.noiseOn(changeType, time, now);
					}
				} else {
					this.wavetableMod.setMinMax(changeType, value, value, time, now);
					this.noiseOff(changeType, time, now);
					if (this.usingOscillator) {
						this.system.makeChange(this.oscillatorGain.gain, changeType, 1, time, now);
					}
					parameters[Parameter.MIN_WAVEFORM] = value;
					parameters[Parameter.MAX_WAVEFORM] = value;
				}
				break;

			case Parameter.MIN_WAVEFORM:
			case Parameter.MAX_WAVEFORM:
				dirtyWavetable = changeType;
				break;

			case Parameter.NOISE_TRACKING:
				if (dirtyWavetable === undefined && parameters[Parameter.WAVEFORM] === Wave.NOISE) {
					this.system.makeChange(this.sampleAndHoldRateMultiplier.gain, changeType, value, time, now);
					if (value === 0) {
						const sampleRate = this.system.sampleRate;
						this.sampleAndHold.sampleRate.setValueAtTime(sampleRate, time);
					} else {
						this.sampleAndHold.sampleRate.setValueAtTime(0, time);
					}
				}
				break;

			case Parameter.WAVE_X:
			case Parameter.WAVE_Y:
				dirtyCustomWave = true;
				break;

			case Parameter.CHORUS:
				this.system.makeChange(this.sine.detune, changeType, value, time, now);
				this.system.makeChange(this.saw.detune, changeType, -value, time, now);
				this.system.makeChange(this.pwmDetune.gain, changeType, CENT ** -value, time, now);
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

			case Parameter.WAVEFORM_LFO:
				this.wavetableMod.setBalance(changeType, value, time, now);
				break;

			case Parameter.VIBRATO_LFO:
				this.vibrato.setBalance(changeType, value, time, now);
				break;

			case Parameter.TREMOLO_LFO:
				this.tremolo.setBalance(changeType, value, time, now);
				break;

			case Parameter.PWM_LFO:
				this.pwm.setBalance(changeType, value, time, now);
				break;

			case Parameter.FILTER_LFO:
				parameters[Parameter.FILTER_FRQUENCY_LFO] = value;
				parameters[Parameter.Q_LFO] = value;
				this.filterFrequencyMod.setBalance(changeType, value, time, now);
				this.filterQMod.setBalance(changeType, value, time, now);
				break;

			case Parameter.FILTER_FREQUENCY_LFO:
				this.filterFrequencyMod.setBalance(changeType, value, time, now);
				break;

			case Parameter.Q_LFO:
				this.filterQMod.setBalance(changeType, value, time, now);
				break;

			case Parameter.DELAY_LFO:
				this.flanger.setBalance(changeType, value, time, now);
				break;

			case Parameter.PAN_LFO:
				this.panMod.setBalance(changeType, value, time, now);
				break;

			case Parameter.FREQUENCY:
				this.setFrequency(changeType, value, time, now);
				this.frequencies = [value];
				this.noteIndex = 0;
				break;

			case Parameter.TUNING_STRETCH:
				this.noteFrequencies = this.system.getNotes(value);
				dirtyNotes = true;
				break;

			case Parameter.NOTES:
				this.frequencies.splice(value.length);
				this.noteChangeType = changeType;
				dirtyNotes = true;
				break;

			case Parameter.DETUNE:
				this.detune = CENT ** value;
				// fall through

			case Parameter.VIBRATO_EXTENT:
			case Parameter.SIREN_EXTENT:
				this.setFrequency(changeType, this.frequencies[this.noteIndex], time, now);
				break;

			case Parameter.VOLUME:
				this.system.makeChange(this.volume.gain, changeType, expCurve(value, 1), time, now);
				break;

			case Parameter.TREMOLO_DEPTH:
				this.tremolo.setMinMax(changeType, 1 - value / 100, 1, time, now);
				break;

			case Parameter.LFO1_RATE:
				value = clamp(value);
				this.lfo1.setFrequency(changeType, value, time);
				parameters[Parameter.LFO1_RATE] = value;
				break;

			case Parameter.LFO2_RATE:
				value = clamp(value);
				this.lfo2.setFrequency(changeType, value, time);
				parameters[Parameter.LFO2_RATE] = value;
				break;

			case Parameter.LFO1_PHASE:
				this.lfo1.phase = value / 360;
				break;

			case Parameter.LFO2_PHASE:
				this.lfo2.phase = value / 360;
				break;

			case Parameter.LFO1_GAIN:
				this.lfo1.gain = value / 100;
				break;

			case Parameter.LFO2_GAIN:
				this.lfo2.gain = value / 100;
				break;

			case Parameter.LFO1_DELAY:
				this.lfo1.delay = value / 1000;
				break;

			case Parameter.LFO2_DELAY:
				this.lfo2.delay = value / 1000;
				break;

			case Parameter.LFO1_ATTACK:
				this.lfo1.attack = value / 1000;
				break;

			case Parameter.LFO2_ATTACK:
				this.lfo2.attack = value / 1000;
				break;

			case Parameter.LFO1_RATE_MOD:
				this.lfo1.rateMod = value;
				break;

			case Parameter.LFO2_RATE_MOD:
				this.lfo2.rateMod = value;
				break;

			case Parameter.LFO1_FADE:
				this.lfo1.fadeDirection = value;
				break;

			case Parameter.LFO2_FADE:
				this.lfo2.fadeDirection = value;
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
				this.lfo2.setRetrigger(value, time);
				parameters[Parameter.LFO2_RETRIGGER] = value;
				if (value === 1) {
					parameters[Parameter.LFO2_RATE_MOD] = 1;
				}
				break;

			case Parameter.PULSE_WIDTH:
				this.pwm.setMinMax(changeType, value / 100, value / 100, time, now);
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
				this.filterFrequencyMod.setMinMax(changeType, value, value, time, now);
				parameters[Parameter.MIN_FILTER_FREQUENCY] = value;
				parameters[Parameter.MAX_FILTER_FREQUENCY] = value;
				break;

			case Parameter.MIN_FILTER_FREQUENCY:
			case Parameter.MAX_FILTER_FREQUENCY:
				dirtyFilterFrequency = changeType;
				break;

			case Parameter.Q:
				this.filterQMod.setMinMax(changeType, value, value, time, now);
				parameters[Parameter.MIN_Q] = value;
				parameters[Parameter.MAX_Q] = value;
				break;

			case Parameter.MIN_Q:
			case Parameter.MAX_Q:
				dirtyFilterQ = changeType;
				break;

			case Parameter.FILTER_GAIN:
				this.system.makeChange(this.filter.gain, changeType, value, time, now);
				break;

			case Parameter.FILTER_MIX:
			case Parameter.UNFILTERED_MIX:
				dirtyMix = changeType;
				break;

			case Parameter.DELAY:
				this.flanger.setMinMax(changeType, value / 1000, value / 1000, time, now);
				parameters[Parameter.MIN_DELAY] = value;
				parameters[Parameter.MAX_DELAY] = value;
				break;

			case Parameter.MIN_DELAY:
			case Parameter.MAX_DELAY:
				dirtyDelay = changeType;
				break;

			case Parameter.DELAY_MIX:
				this.system.makeChange(this.delayedPath.gain, changeType, value / 100, time, now);
				this.system.makeChange(this.undelayedPath.gain, changeType, 1 - value / 100, time, now);
				break;

			case Parameter.FEEDBACK:
				this.system.makeChange(this.feedback.gain, changeType, value / 100, time, now);
				this.system.makeChange(this.delayOutput.gain, changeType, 1 / (1 - Math.abs(value) / 100), time, now);
				break;

			case Parameter.PAN:
				this.pannerMod.setMinMax(changeType, value / 100, value / 100, time, now);
				parameters[Parameter.LEFTMOST_PAN] = value;
				parameters[Parameter.RIGHTMOST_PAN] = value;
				break;

			case Parameter.LEFTMOST_PAN:
			case Parameter.RIGHTMOST_PAN:
				dirtyPan = changeType;
				break;

			case Parameter.RING_MOD:
				if (this.hasConnection) {
					this.system.makeChange(this.ringMod.gain, changeType, 1 - value / 100, time, now);
					this.system.makeChange(this.ringInput.gain, changeType, value / 100, time, now);
				} else {
					console.warn('Unable to apply ring modulation. No modulator channel connected.')
				}
				break;

			case Parameter.TICKS:
				parameters[Parameter.TICKS] = numTicks;
				break;

			case Parameter.DELAY_TICKS:
				parameters[Parameter.DELAY_TICKS] = delay;
				break;

			case Parameter.CHORD_SPEED:
				dirtyTickEvents = true;
				break;

			case Parameter.CHORD_PATTERN:
				if (value === Chord.CYCLE) {
					this.chordDir = 1;
				}
				break;

			case Parameter.GLISSANDO:
			case Parameter.GLISSANDO_TICKS:
				dirtyTickEvents = true;
				break;

			case Parameter.RETRIGGER:
				if (value === 0) {
					endRetrigger = true;
				}
				dirtyTickEvents = true;
				break;

			case Parameter.LEGATO_RETRIGGER:
				value = Math.trunc(Math.abs(value)) % 2;
				parameters[Parameter.LEGATO_RETRIGGER] = value;
				break;

			case Parameter.RETRIGGER_VOLUME:
				this.retriggerVolumeChangeType = changeType;
				break;

			case Parameter.OFFSET:
				if (value < 0) {
					parameters[Parameter.OFFSET] = 0;
				}
				break;

			case undefined:
				console.error('An undefined synthesizer parameter was used.');
				break;
			} // end switch
		} // end loop over each parameter

		const gateParam = parameters[Parameter.GATE];
		const gateOpening = (gate & Gate.OPEN) !== 0;
		const gateOpen = (gateParam & Gate.TRIGGER) === Gate.OPEN;

		const notes = parameters[Parameter.NOTES];
		const numNotes = notes.length;
		const noteChangeType = this.noteChangeType;
		const frequencies = this.frequencies;
		const chordTicks = parameters[Parameter.CHORD_SPEED];
		let arpGlideTime = parameters[Parameter.GLIDE] * chordTicks * tickTime;
		let noteIndex;

		if (dirtyNotes || gateOpening) {
			const firstNote = notes[0];
			const frequency = this.noteFrequencies[firstNote];
			if (noteChangeType === ChangeType.SET) {
				this.setFrequency(ChangeType.SET, frequency, time, now);
			} else {
				let glideTime;
				if (numNotes === 1) {
					glideTime = parameters[Parameter.GLIDE] * lineTime * TIME_STEP;
				} else {
					glideTime = arpGlideTime;
				}
				this.setFrequency(ChangeType.SET, this.vibrato.centre, time, now);
				this.setFrequency(noteChangeType, frequency, time + glideTime, now);
			}
			frequencies[0] = frequency;
			parameters[Parameter.FREQUENCY] = frequency;
			for (let i = 1; i < notes.length; i++) {
				frequencies[i] = this.noteFrequencies[notes[i]];
			}
			this.noteIndex = 0;
			noteIndex = 0;
			this.tickCounter = 0;
		}
		if (dirtyWavetable !== undefined) {
			const min = parameters[Parameter.MIN_WAVEFORM];
			let max = parameters[Parameter.MAX_WAVEFORM];
			parameters[Parameter.WAVEFORM] = min;
			this.wavetableMod.setMinMax(dirtyWavetable, min, max, time, now);
			if (this.usingOscillator) {
				this.system.makeChange(this.oscillatorGain.gain, dirtyWavetable, 1, time, now);
				this.noiseOff(dirtyWavetable, time, now);
			}
		}
		if (dirtyPWM !== undefined) {
			this.pwm.setMinMax(dirtyPWM, parameters[Parameter.MIN_PULSE_WIDTH] / 100, parameters[Parameter.MAX_PULSE_WIDTH] / 100, time, now);
		}
		if (dirtyEnvelope) {
			this.calcEnvelope();
		}
		if (dirtySustain) {
			this.sustain = expCurve(parameters[Parameter.VELOCITY] * parameters[Parameter.SUSTAIN] / 127, 1);
		}
		if (dirtyCustomWave) {
			const shape = this.waveShapeFromCoordinates();
			callbacks.push(function () {
				me.shaper.curve = shape;
			});
		}
		if (dirtyFilterFrequency !== undefined) {
			this.filterFrequencyMod.setMinMax(dirtyFilterFrequency, parameters[Parameter.MIN_FILTER_FREQUENCY], parameters[Parameter.MAX_FILTER_FREQUENCY], time, now);
		}
		if (dirtyFilterQ !== undefined) {
			this.filterQMod.setMinMax(dirtyFilterQ, parameters[Parameter.MIN_Q], parameters[Parameter.MAX_Q], time, now);
		}
		if (dirtyMix !== undefined) {
			let filtered = expCurve(parameters[Parameter.FILTER_MIX], 1);
			let unfiltered = expCurve(parameters[Parameter.UNFILTERED_MIX], 1);
			const total = filtered + unfiltered;
			if (total < 1 && total > 0) {
				filtered = filtered / total;
				unfiltered = unfiltered / total;
			}
			this.system.makeChange(this.filteredPath.gain, dirtyMix, filtered, time, now);
			this.system.makeChange(this.unfilteredPath.gain, dirtyMix, unfiltered, time, now);
		}
		if (dirtyDelay !== undefined) {
			this.flanger.setMinMax(dirtyDelay, parameters[Parameter.MIN_DELAY] / 1000, parameters[Parameter.MAX_DELAY] / 1000, time, now);
		}
		if (dirtyPan !== undefined) {
			this.panMod.setMinMax(dirtyPan, parameters[Parameter.LEFTMOST_PAN] / 100, parameters[Parameter.RIGHTMOST_PAN] / 100, time, now);
		}

		const gateFullyClosed = gateParam === Gate.CUT;
		let glissandoSteps = parameters[Parameter.GLISSANDO];
		const retriggerTicks = parameters[Parameter.RETRIGGER];
		let glissandoAmount, chordDir, noteRepeated;

		if (dirtyTickEvents) {
			let modulus;
			if (retriggerTicks === 0) {
				modulus = chordTicks;
			} else {
				modulus = lcm(retriggerTicks, chordTicks);
			}
			if (glissandoSteps !== 0) {
				modulus *= Math.ceil((parameters[Parameter.GLISSANDO_TICKS] + 1) / modulus);
			}
			this.tickModulus = modulus;
		}

		if (gateOpening) {
			glissandoAmount = 0;
			noteIndex = 0;
			chordDir = 1;
			noteRepeated = false;
		} else {
			glissandoAmount = this.glissandoStepsDone;
			noteIndex = this.noteIndex;
			chordDir = this.chordDir;
			noteRepeated = this.noteRepeated;
		}

		if (gate !== undefined) {
			this.gate(gate, notes[0], this.velocity, this.sustain, lineTime, time);
		} else if (endRetrigger && gateOpen) {
			this.gate(Gate.REOPEN, notes[noteIndex] + glissandoAmount, this.velocity, this.sustain, lineTime, time);
		}

		if (newLine) {
			// TODO optimize the case when the gate was triggered or closed in a previous step and has now fully closed.
			this.system.nextLine = Math.max(this.system.nextLine, step + lineTime);

			if (
				((Math.abs(glissandoAmount) < Math.abs(glissandoSteps) || numNotes > 1) && !gateFullyClosed) ||
				(retriggerTicks > 0 && (gateOpening || gateOpen))
			) {
				numTicks = numTicks - (delay % numTicks);
				const roundedNumTicks = Math.ceil(numTicks);

				let glissandoFractionalAmt = glissandoAmount;
				glissandoAmount = Math.trunc(glissandoAmount);
				let prevGlissandoAmount = glissandoAmount;
				const glissandoPerTick = glissandoSteps / parameters[Parameter.GLISSANDO_TICKS];

				let tick = gateOpening ? 1 : 0;
				tickOffset = this.tickCounter;
				let volume = this.velocity;
				let endVolume = expCurve(volume * parameters[Parameter.RETRIGGER_VOLUME], 1);
				if (endVolume > 1) {
					endVolume = 1;
				}
				const pattern = parameters[Parameter.CHORD_PATTERN];

				const retriggerGate = Gate.TRIGGER + parameters[Parameter.LEGATO_RETRIGGER] * Gate.LEGATO;
				let retriggerVolumeChange;
				if (this.retriggerVolumeChangeType === ChangeType.SET) {
					retriggerVolumeChange = new Change(ChangeType.SET, endVolume);
				} else {
					let numTriggers = Math.trunc((roundedNumTicks - 1) / retriggerTicks);
					if (numTriggers === 0) {
						numTriggers = 1; // When the gate's left open jump straight to the final volume
					}
					if (this.retriggerVolumeChangeType === ChangeType.LINEAR) {
						retriggerVolumeChange = new Change(ChangeType.DELTA, (endVolume - volume) / numTriggers);
					} else {
						retriggerVolumeChange = new Change(ChangeType.MULTIPLY, (endVolume / volume) ** (1 / numTriggers));
					}
				}
				let scheduledUntil = this.scheduledUntil;

				while (tick < roundedNumTicks) {
					const timeOfTick = time + tick * tickTime;

					if (Math.abs(glissandoAmount) < Math.abs(glissandoSteps)) {
						glissandoFractionalAmt = (tick + tickOffset) * glissandoPerTick;
						glissandoAmount = Math.trunc(glissandoFractionalAmt);
					}
					let newFrequency = glissandoAmount !== prevGlissandoAmount;
					if (numNotes > 1 && (tick + tickOffset) % chordTicks === 0) {
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
						if (noteChangeType === ChangeType.SET ||
							numNotes === 1 ||
							(tick + tickOffset) % chordTicks !== 0
						) {
							this.setFrequency(ChangeType.SET, frequency, timeOfTick, now);
						} else {
							this.setFrequency(ChangeType.SET, this.vibrato.centre, timeOfTick, now);
							this.setFrequency(noteChangeType, frequency, timeOfTick + arpGlideTime, now);
						}
						scheduledUntil = timeOfTick;
					}

					if ((gateOpen || gateOpening) && (tick + tickOffset) % retriggerTicks === 0) {
						volume = calculateParameterValue(retriggerVolumeChange, volume, false)[1];
						const sustain = this.sustain * volume / this.velocity;
						this.gate(retriggerGate, notes[noteIndex] + glissandoAmount, volume, sustain, lineTime, timeOfTick);
						scheduledUntil = timeOfTick;
					}
					prevGlissandoAmount = glissandoAmount;
					tick++;
				}
				this.noteIndex = noteIndex;
				this.chordDir = chordDir;
				this.noteRepeated = noteRepeated;
				this.glissandoStepsDone = glissandoFractionalAmt;
				this.scheduledUntil = scheduledUntil;
				this.tickCounter = (tickOffset + numTicks) % this.tickModulus;
			}
		}

		const numCallbacks = callbacks.length;
		if (numCallbacks > 0) {
			const timer = this.setTimeout(function () {
				for (let callback of callbacks) {
					callback();
				}
				me.timeoutComplete(timer);
			}, time, now);
		}
		this.prevLineTime = lineTime;
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
			sampleRate: 8363,
		});
		buffers[0] = buffer;
		const channelData = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			channelData[i] = view.getInt8(i) / 128;
		}

	}
	return buffers[0];
}

function audioBufferToWav(audioBuffer) {
	const numberOfSamples = audioBuffer.length;
	const numberOfChannels = audioBuffer.numberOfChannels;
	const sampleRate = audioBuffer.sampleRate;
	const headerLength = 46;
	const fileLength = numberOfSamples * numberOfChannels * 4 + headerLength;
	const arrayBuffer = new ArrayBuffer(fileLength);
	const view = new DataView(arrayBuffer);
	let writePos = 0;

	// Write header
	setUint32(0x46464952);				// "RIFF"
	setUint32(fileLength - 8);			// file length - 8
	setUint32(0x45564157);				// "WAVE"

	setUint32(0x20746d66);				// "fmt " chunk
	setUint32(18);						// length
	setUint16(3);						// floating point samples
	setUint16(numberOfChannels);
	setUint32(sampleRate);
	setUint32(sampleRate * 4 * numberOfChannels); // avg. bytes/sec
	setUint16(numberOfChannels * 4); 	// block-align
	setUint16(32);						// 32-bit
	setUint16(0)						// zero length extension

	setUint32(0x61746164);				// "data" - chunk
	setUint32(fileLength - writePos - 4); // chunk length

	// Write interleaved data.
	for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
		const channel = audioBuffer.getChannelData(channelNumber);
		writePos = headerLength + channelNumber * 4;
		for (let i = 0; i < numberOfSamples; i++) {
			view.setFloat32(writePos, channel[i], true);
			writePos += numberOfChannels * 4;
		}
	}

	// Create BLOB
	return new Blob([arrayBuffer], {type: "audio/wav"});

	function setUint16(data) {
		view.setUint16(writePos, data, true);
		writePos += 2;
	}

	function setUint32(data) {
		view.setUint32(writePos, data, true);
		writePos += 4;
	}
}

global.Synth = {
	Change: Change,
	Channel:  Channel,
	System: SynthSystem,
	ChangeType: ChangeType,
	CHANGE_TYPE_MASK: CHANGE_TYPE_MASK,
	ChangeTypes: ChangeTypes,
	Direction: Direction,
	Gate: Gate,
	Instrument: Instrument,
	SampledInstrument: SampledInstrument,
	MachineChange: MachineChange,
	Macro: Macro,
	MacroFunction: MacroFunction,
	MacroChange: MacroChange,
	Pattern: Chord,
	Param: Parameter,
	Resource: Resource,
	ResourceLoadError: ResourceLoadError,
	Sample: Sample,
	SamplePlayer,
	TempoAutomation: TempoAutomation,
	Wave: Wave,

	// Internals exposed as generic reusable code
	LFO: LFO,
	Modulator: Modulator,
	ReciprocalNode: ReciprocalNode,
	SampleAndHoldNode: SampleAndHoldNode,
	WavetableNode: WavetableNode,
	audioBufferToWav: audioBufferToWav,
	aWeighting: aWeighting,
	calculateParameterValue: calculateParameterValue,
	decodeSampleData: decodeSampleData,
	enumFromArray: enumFromArray,
	equalValues: equalValues,
	expCurve: expCurve,
	fillNoise: fillNoise,
	gcd: gcd,
	lcm: lcm,
	noteFrequencies: noteFrequencies,
	noteFromFrequency: noteFromFrequency,
	randomize: randomize,

	// Constants
	TRIGGER_TIME: TRIGGER_TIME,
};

})(window);

class Machine {

	constructor(parameters) {
		this.inputs = [];
		this.outputs = [];
		this.parameters = parameters;
	}

	connect(after) {
		for (let output of this.outputs) {
			output.connect(after);
		}
	}

	connectBetween(before, after) {
		before.disconnect(after);
		for (let input of this.inputs) {
			before.connect(input);
		}
		for (let output of this.outputs) {
			output.connect(after);
		}
	}

	connectAfter(before) {
		for (let input of this.inputs) {
			before.connect(input);
		}
	}

	disconnect(after) {
		for (let output of this.outputs) {
			output.disconnect(after);
		}
	}

}

Machines = {};
