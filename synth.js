(function (global) {
'use strict';

const SEMITONE = 2 ** (1 / 12);
const CENT = 2 ** (1 / 1200);

const LFO_MAX = 20;
const TIME_STEP = 0.02; // 50 steps per second

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
	'GATE',			// CLOSED, OPEN, TRIGGER or CUT
	'WAVEFORM',		// combinations of Waveform enum values
	'FREQUENCY',	// in hertz
	'DETUNE',		// in cents
	'NOTES',		// MIDI note number
	'LFO1_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO1_RATE',	// in hertz
	'LFO1_DELAY',	// in milliseconds
	'LFO1_ATTACK',	// in milliseconds
	'LFO1_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO1_FADE', // one of the Direction enums
	'LFO2_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO2_RATE',	// in hertz
	'LFO2_MIN_RATE', // in hertz
	'LFO2_MAX_RATE', // in hertz
	'LFO2_DELAY',	// in milliseconds
	'LFO2_ATTACK',	// in milliseconds
	'LFO2_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO2_FADE', // one of the Direction enums
	'LFO3_WAVEFORM', // 'sine', 'square', 'sawtooth' or 'triangle'
	'LFO3_RATE',	// in hertz
	'LFO3_DELAY',	// in milliseconds
	'LFO3_ATTACK',	// in milliseconds
	'LFO3_RATE_MOD', // scaling factor for frequency at beginning of attack period
	'LFO3_FADE', // one of the Direction enums
	'VIBRATO_LFO',	// which LFO to use
	'VIBRATO_EXTENT', // in cents
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
	'RING_MODULATION', // 0 to 100
	'SYNC',			// 0 or 1
	'LINE_TIME',	// in steps
	'TICKS',		// maximum number of events during a LINE_TIME
	'RETRIGGER',	// number of ticks between retriggers
	'MULTI_TRIGGER', // 0 or 1 (for chords)
	'CHORD_SPEED',	// number of ticks between notes of a broken chord
	'CHORD_PATTERN', // A value from the Pattern enum
	'GLISSANDO_SIZE', // number of steps
	'SAMPLE',		// array index of the sample to play.
	'SAMPLE_OFFSET', // in seconds
	'SCALE_AHD',	// dimensionless (-1 or more)
	'SCALE_RELEASE', // dimensionless (0 or less)
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
		const oscillator = audioContext.createOscillator();
		this.oscillator = oscillator;
		oscillator.frequency.value = 5;
		this.frequency = 5;

		const envelope = audioContext.createGain();
		this.envelope  = envelope;
		oscillator.connect(envelope);

		this.delay = 0;
		this.attack = 0;
		this.rateMod = 1;
		this.fadeDirection = Direction.UP;
	}

	start(when) {
		this.oscillator.start(when);
	}

	setFrequency(changeType, frequency, time) {
		const param = this.oscillator.frequency;
		param.cancelAndHoldAtTime(time);
		param[changeType](frequency, time);
		this.frequency = frequency;
	}

	trigger(when) {
		const gain = this.envelope.gain;
		gain.cancelAndHoldAtTime(when);

		const endDelay = when + this.delay;
		const endAttack = endDelay + this.attack;

		if (endAttack === when) {
			gain.setValueAtTime(1, when);
		} else {
			const startValue = this.fadeDirection === Direction.UP ? 0 : 1;
			const endValue = 1 - startValue;

			gain.setValueAtTime(startValue, when);
			gain.setValueAtTime(startValue, endDelay);
			gain.linearRampToValueAtTime(endValue, endAttack);

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


class SynthSystem {
	constructor(audioContext, callback) {
		const me = this;
		audioContext.audioWorklet.addModule('audioworkletprocessors.js').then(function () {
			if (callback !== undefined) {
				callback(me);
			}
		});

		this.audioContext = audioContext;
		this.channels = [];
		this.samples = [];
		this.loopSample = [];
		this.sampleLoopStart = [];
		this.sampleLoopEnd = [];
		this.sampledNote = [];

		this.startTime = audioContext.currentTime;
		this.tempoChanged = 0;
		this.systemParameters = [Parameter.LINE_TIME, Parameter.TICKS];

		const volume = audioContext.createGain();
		this.volume = volume;
		volume.connect(audioContext.destination);
	}

	addChannel(channel) {
		this.channels.push(channel);
	}

	begin() {
		const now = this.audioContext.currentTime;
		const startTime = this.startTime;
		const step = Math.trunc((now - startTime) / TIME_STEP);
		this.startTime = startTime + (step + 1) * TIME_STEP;
		this.tempoChanged = 0;
	}

	start() {
		const now = this.audioContext.currentTime;
		const startTime = (Math.trunc(now / TIME_STEP) + 1) * TIME_STEP;

		for (let channel of this.channels) {
			channel.start(startTime);
		}
		this.startTime = startTime;
	}

	loadSample(number, url, callback) {
		const me = this;

		if (this.samples[number] === undefined) {
			this.loopSample[number] = false;
			this.sampleLoopStart[number] = 0;
			this.sampleLoopEnd[number] = Number.MAX_VALUE;
			this.sampledNote[number] = 69;
		}

		const request = new XMLHttpRequest();
		request.open('GET', url);
		request.responseType = 'arraybuffer';
		request.timeout = 60000;

		request.addEventListener('load', function (event) {
	  		if (request.status < 400) {
		  		me.audioContext.decodeAudioData(request.response)
		  		.then(function(buffer) {
		  			me.samples[number] = buffer;
		  			callback(url, true, '');

		  		}).catch(function (error) {
		  			callback(url, false, error.message)
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
	}

	setSample(number, buffer) {
		if (this.samples[number] === undefined) {
			this.loopSample[number] = false;
			this.sampleLoopStart[number] = 0;
			this.sampleLoopEnd[number] = Number.MAX_VALUE;
			this.sampledNote[number] = 69;
		}
		this.samples[number] = buffer;
	}

	removeSample(number) {
		this.samples[number] = undefined;
	}

	setSampledNote(sample, note) {
		this.sampledNote[sample] = note;
		for (let channel of this.channels) {
			channel.computePlaybackRate();
		}
	}

	getSamplePlayer(index) {
		const samplePlayer = this.audioContext.createBufferSource();
		const sample = this.samples[index];
		if (sample !== undefined) {
			samplePlayer.buffer = sample;
			const loop = this.loopSample[index];
			if (loop) {
				samplePlayer.loop = true;
				samplePlayer.loopStart = this.sampleLoopStart[index];
				samplePlayer.loopEnd = this.sampleLoopEnd[index];
			}
		} else {
			this.sampledNote[index] = 69;
		}
		return samplePlayer;
	}

	getSamplePeriod(index) {
		return 1 / noteFrequencies[this.sampledNote[index]];
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

class LogNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'log-processor', {numberOfOutputs: 0});
	}

	get steps() {
		return this.parameters('steps');
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
			'sine',	// LFO 1 shape
			5,		// LFO 1 rate
			0,		// LFO 1 delay
			0,		// LFO 2 attack
			1,		// LFO 1 at a constant frequency
			Direction.UP, // LFO 1 fades up (when an attack is set)
			'sine',	// LFO 2 shape
			5,		// LFO 2 rate
			5,		// LFO 2 min rate
			5,		// LFO 2 max rate
			0,		// LFO 2 delay
			0,		// LFO 2 attack
			1,		// LFO 2 at a constant frequency
			Direction.UP, // LFO 2 fades up (when an attack is set)
			'sine',	// LFO 3 shape
			5,		// LFO 3 rate
			0,		// LFO 3 delay
			0,		// LFO 3 attack
			1,		// LFO 3 at a constant frequency
			Direction.UP, // LFO 3 fades up (when an attack is set)
			1,		// vibrato uses LFO 1
			0,		// vibrato extent
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
			24,		// line time (125bpm, allegro)
			24,		// number of ticks for broken chords, glissando and retrigger
			0,		// retrigger time (ticks)
			0,		// don't use multi-trigger
			1,		// broken chord speed
			Chord.TO_AND_FRO_2,	// chord pattern
			0,		// glissando length
			0,		// use first sample
			0,		// no sample offset
			0,		// envelope scaling for AHD portion of the envelope
			0,		// envelope scaling for the release
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
		this.samplePlayer = undefined;
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

		this.noteFrequencies = [];
		this.tune(440, 0);

		volume.connect(system.volume);
		system.addChannel(this);
	}

	tune(a4, stretch) {
		const noteFrequencies = this.noteFrequencies;
		const s = 1 + stretch / 100;
		for (let i = 0; i <= 127; i++) {
			noteFrequencies[i] = 2 ** ((i - 69) * s / 12) * a4;
		}
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

	computePlaybackRate() {
		this.playRateMultiplier.gain.setValueAtTime(this.system.getSamplePeriod(this.parameters[Parameter.SAMPLE]), time);
	}

	playSample(time) {
		if (this.samplePlayer !== undefined) {
			this.samplePlayer.stop(time);
		}
		const parameters = this.parameters;
		const sampleNumber = parameters[Parameter.SAMPLE];
		const samplePlayer = this.system.getSamplePlayer(sampleNumber);
		this.playRateMultiplier.connect(samplePlayer.playbackRate);
		samplePlayer.connect(this.sampleGain);
		samplePlayer.start(time, parameters[Parameter.SAMPLE_OFFSET]);
		this.samplePlayer = samplePlayer;
	}

	triggerLFOs(when) {
		this.lfo1.trigger(when);
		this.lfo2.trigger(when);
		this.lfo3.trigger(when);
	}

	gate(state, start) {
		const parameters = this.parameters;
		const velocity = this.velocity;
		const sustainLevel = this.sustain;
		let beginRelease, endTime;

		const playSample = parameters[Parameter.SOURCE] > 0;
		const velocityReduction = (100 - parameters[Parameter.VELOCITY]) / 100;
		const scaleAHD = 1 + parameters[Parameter.SCALE_AHD] * velocityReduction;
		const scaleRelease = 1 - parameters[Parameter.SCALE_RELEASE] * velocityReduction;
		const releaseTime = scaleRelease * this.release;
		const gain = this.envelope.gain;

		const endAttack = start + scaleAHD * this.endAttack;
		const attackConstant = this.attackConstant * scaleAHD;
		const releaseConstant = 4;

		if ((state & Gate.MULTI_TRIGGERABLE) === 0) {
			gain.cancelAndHoldAtTime(start - 0.001);
			gain.setTargetAtTime(0, start - 0.001, 0.001 / 2);
			if ((state & Gate.OPEN) !== 0) {
				gain.setTargetAtTime(velocity * this.attackScale, start, attackConstant);
				gain.setValueAtTime(velocity, endAttack);
			}
		} else {
			gain.cancelAndHoldAtTime(start);
			if ((state & Gate.OPEN) !== 0) {
				gain.setTargetAtTime(velocity, start, (endAttack - start) / parameters[Parameter.ATTACK_CURVE]);
			}
		}

		switch (state) {
		case Gate.OPEN:
		case Gate.REOPEN:
			this.triggerLFOs(start);
			gain.setValueAtTime(velocity, start + scaleAHD * this.endHold);
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
			if (this.samplePlayer !== undefined) {
				this.samplePlayer.stop(endTime);
				this.samplePlayer = undefined;
			}
			break;

		case Gate.TRIGGER:
		case Gate.MULTI_TRIGGER:
			if (playSample) {
				this.playSample(start);
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
			gain.setValueAtTime(velocity, endHold);
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
			if (this.samplePlayer !== undefined) {
				this.samplePlayer.stop(start);
				this.samplePlayer = undefined;
			}
			break;
		}
	}

	setFrequency(changeType, frequency, when) {
		frequency = frequency * this.detune;
		const vibratoExtent = CENT ** (this.parameters[Parameter.VIBRATO_EXTENT] / 2);
		this.vibrato.cancelAndHoldAtTime(when);
		this.vibrato.setMinMax(changeType, frequency / vibratoExtent, frequency * vibratoExtent, when);
	}

	setParameters(parameterMap, step) {
		const me = this;
		const parameters = this.parameters;
		const numLFOs = this.lfos.length;
		let gate = parameterMap.get(Parameter.GATE);
		if (gate !== undefined) {
			gate = gate.value;
		}

		// Each of these holds a change type (or undefined for no change)
		let dirtyPWM, dirtyFilterFrequency, dirtyFilterQ, dirtyMix, dirtyDelay, dirtyPan;
		let dirtyLFO2Rate;

		let dirtyEnvelope = false;
		let dirtySustain = false;
		let dirtyNumTicks = false;
		let frequencySet = false;
		let sampleChanged = false;

		const now = this.system.audioContext.currentTime;
		if (step === undefined) {
			step = (now - this.system.startTime) / TIME_STEP + 1;
		}
		step = Math.trunc(step);
		const time = this.system.startTime + step * TIME_STEP;
		const timeDifference = Math.round((time - now) * 1000);
		const callbacks = [];

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
				this.lfo2.setFrequency(changeType, value, time);
				parameters[Parameter.LFO2_RATE] = value;
				parameters[Parameter.LFO2_MIN_RATE] = value;
				parameters[Parameter.LFO2_MAX_RATE] = value;
				break;

			case Parameter.LFO2_MIN_RATE:
				parameters[Parameter.LFO2_MIN_RATE] = clamp(value);
				dirtyLFO2Rate = changeType;
				break;

			case Parameter.LFO2_MAX_RATE:
				parameters[Parameter.LFO2_MAX_RATE] = clamp(value);
				dirtyLFO2Rate = changeType;
				break;

			case Parameter.LFO3_RATE:
				value = clamp(value);
				this.lfo3.setFrequency(changeType, value, time);
				parameters[Parameter.LFO3_RATE] = value;
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

			case Parameter.RING_MODULATION:
				this.ringMod.gain[changeType](1 - value / 100, time);
				this.ringInput.gain[changeType](value / 100, time);
				break;

			case Parameter.LINE_TIME:
				this.system.tempoChanged = step;
				dirtyNumTicks = true;
				break;

			case Parameter.TICKS:
				dirtyNumTicks = true;
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

			case Parameter.SAMPLE:
				this.playRateMultiplier.gain.setValueAtTime(this.system.getSamplePeriod(value), time);
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

		if (dirtyNumTicks) {
			const numTicks = parameters[Parameter.TICKS];
			if (numTicks > parameters[Parameter.LINE_TIME]) {
				parameters[Parameter.TICKS] = parameters[Parameter.LINE_TIME];
			} else if (numTicks < 1) {
				parameters[Parameter.TICKS] = 1;
			}
			this.copyParameters([Parameter.LINE_TIME, Parameter.TICKS]);
		}

		const gateOpen = parameters[Parameter.GATE] === Gate.OPEN;
		const newLine = (step - this.system.tempoChanged) % parameters[Parameter.LINE_TIME] === 0;
		const frequencies = this.frequencies;
		let glissandoSteps = parameters[Parameter.GLISSANDO_SIZE];
		let glissandoAmount, prevGlissandoAmount, noteIndex, chordDir, noteRepeated;

		if (gate !== undefined) {
			this.gate(gate, time);
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
				this.playSample(time);
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
				const numTicks = parameters[Parameter.TICKS];
				const tickTime = (parameters[Parameter.LINE_TIME] * TIME_STEP) / numTicks;

				let glissandoPerTick;
				if (glissandoSteps === 0) {
					glissandoPerTick = 0;
				} else if (glissandoSteps > 0) {
				 	glissandoPerTick = (glissandoSteps + 1) / numTicks;
				} else {
					glissandoPerTick = (glissandoSteps - 1) / numTicks;
				}

				let tick = 1;
				const pattern = parameters[Parameter.CHORD_PATTERN];
				const retriggerGate = Gate.TRIGGER + parameters[Parameter.MULTI_TRIGGER] * Gate.MULTI_TRIGGERABLE;
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
						this.gate(retriggerGate, timeOfTick);
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

	copyParameters(paramNumbers) {
		const channels = this.system.channels;
		for (let paramNumber of paramNumbers) {
			const value = this.parameters[paramNumber];
			for (let channel of channels) {
				channel.parameters[paramNumber] = value;
			}
		}
	}

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
	Source: Source,
	Waveform: Waveform,
	Modulator: Modulator,
	C64Oscillator: C64OscillatorNode,
	LogNode: LogNode,
	enumFromArray: enumFromArray,
	keymap: keymap,
	volumeCurve: volumeCurve,
};

})(window);
