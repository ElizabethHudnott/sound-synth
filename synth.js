(function (global) {
'use strict';

const NEARLY_ZERO = 1 / 65535;
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

const Parameter = Object.freeze({
	VELOCITY: 0,	// percentage
	DELAY: 1,		// in milliseconds
	ATTACK: 2,		// in milliseconds
	HOLD: 3,		// in milliseconds
	DECAY: 4,		// in milliseconds
	DECAY_SHAPE: 5, // ChangeType.LINEAR or ChangeType.EXPONENTIAL
	SUSTAIN: 6,		// percentage
	RELEASE: 7,		// in milliseconds
	RELEASE_SHAPE: 8, // ChangeType.LINEAR or ChangeType.EXPONENTIAL
	DURATION: 9,	// in milliseconds (0 = auto)
	GATE: 10,		// CLOSED, OPEN, TRIGGER or CUT
	WAVEFORM: 11,	// combinations of Waveform enum values
	FREQUENCY: 12,	// in hertz
	DETUNE: 13,		// in cents
	NOTES: 14,		// MIDI note number
	LFO1_WAVEFORM: 15, // 'sine', 'square', 'sawtooth' or 'triangle'
	LFO1_RATE: 16, // in hertz
	LFO1_DELAY: 17, // in milliseconds
	LFO1_ATTACK: 18, // in milliseconds
	LFO1_RATE_MOD: 19, // scaling factor for frequency at beginning of attack period
	LFO1_SYNC: 20,
	LFO2_WAVEFORM: 21, // 'sine', 'square', 'sawtooth' or 'triangle'
	LFO2_RATE: 22, // in hertz
	LFO2_DELAY: 23, // in milliseconds
	LFO2_ATTACK: 24, // in milliseconds
	LFO2_RATE_MOD: 25, // scaling factor for frequency at beginning of attack period
	LFO2_SYNC: 26,
	VIBRATO_LFO: 27,	// which LFO to use (1 or 2)
	VIBRATO_EXTENT: 28, // in cents
	VOLUME: 29,		// percentage
	TREMOLO_LFO: 30, // which LFO to use (1 or 2)
	TREMOLO_AMOUNT: 31, // percentage
	PAN: 32,		// -100 to 100
	SOURCE: 33,		// 0 (oscillator) to 100 (samples)
	PULSE_WIDTH: 34,// percentage
	MIN_PULSE_WIDTH: 35, // percentage
	MAX_PULSE_WIDTH: 36, // percentage
	PWM_LFO: 37,		// which LFO to use (1 or 2)
	FILTERED_AMOUNT: 38, // percentage
	FILTER_TYPE: 39, // 'lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf' or 'peaking'
	FILTER_FREQUENCY: 40, // in hertz
	MIN_FILTER_FREQUENCY: 41, // in hertz
	MAX_FILTER_FREQUENCY: 42, // in hertz
	Q: 43,	// 0.0001 to 1000
	MIN_Q: 44,
	MAX_Q: 45,
	FILTER_LFO: 46,	// which LFO to use (1 or 2)
	FILTER_GAIN: 47, // -40dB to 40dB
	RING_MODULATION: 48, // 0 to 100
	SYNC: 49,		// 0 or 1
	LINE_TIME: 50,	// in steps
	TICKS: 51, // maximum number of events during a LINE_TIME
	RETRIGGER: 52,	// number of ticks between retriggers
	CHORD_SPEED: 53, // number of ticks between notes of a broken chord
	CHORD_PATTERN: 54, // A value from the Pattern enum
	GLISSANDO_SIZE: 55, // number of steps
	SAMPLE: 56,		// array index of the sample to play.
	SAMPLE_OFFSET: 57, // in seconds
	SCALE_AHD: 58,	// dimensionless (-1 or more)
	SCALE_RELEASE: 59, // dimensionless (0 or less)
});

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

const Gate = Object.freeze({
	CLOSED: 0,
	CUT: 1,
	OPEN: 2,
	TRIGGER: 3,
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
})

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
		if (this.delay > 0 || this.attack > 0) {
			const gain = this.envelope.gain;
			gain.cancelAndHoldAtTime(when);
			const endDelay = when + this.delay;
			const endAttack = endDelay + this.attack;
			gain.setValueAtTime(0, when);
			gain.setValueAtTime(0, endDelay);
			gain.linearRampToValueAtTime(1, endAttack);
			if (this.rateMod !== 1) {
				const frequency = this.oscillator.frequency;
				frequency.cancelAndHoldAtTime(when);
				frequency.setValueAtTime(this.frequency * this.rateMod, endDelay);
				frequency.linearRampToValueAtTime(this.frequency, endAttack);
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
		this.range.gain[changeType](range, time);
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

		this.shortestTime = 1 / audioContext.sampleRate;
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
			1,		// delay
			2,		// attack
			0,		// hold
			50,		// decay
			ChangeType.LINEAR,	// decay shape
			70,		// sustain
			300,	// release
			ChangeType.LINEAR, // release shape
			200,	// duration
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
			0,		// LFO 1 not synced to tempo
			'sine',	// LFO 2 shape
			5,		// LFO 2 rate
			0,		// LFO 2 delay
			0,		// LFO 2 attack
			1,		// LFO 2 at a constant frequency
			0,		// LFO 2 not synced to tempo
			2,		// vibrato uses LFO 2
			0,		// vibrato extent
			100,	//	volume
			1,		// tremolo uses LFO 1
			0,		// tremolo amount
			0,		// pan
			Source.OSCILLATOR,
			50,		// pulse width
			50,		// min pulse width
			50,		// max pulse width
			1,		// PWM uses LFO 1
			100,	// filter fully enabled
			'lowpass', // filter type
			4400,	// filter frequency
			4400,	// minimum filter frequency
			4400,	// maximum filter frequency
			1,		// filter Q
			1,		// min filter Q
			1,		// max filter Q
			1,		// filter uses LFO 1
			0,		// filter gain
			0,		// ring modulation
			0,		// sync
			24,		// line time (125bpm, allegro)
			24,		// number of ticks for broken chords, glissando and retrigger
			0,		// retrigger time (ticks)
			1,		// broken chord speed
			Chord.TO_AND_FRO_2,	// chord pattern
			0,		// glissando length
			0,		// use first sample
			0,		// no sample offset
			0,		// envelope scaling for AHD portion of the envelope
			0,		// envelope scaling for the release
		];
		this.velocity = 1;
		this.delay = 0.001;
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

		const lfo1 = new LFO(audioContext);
		this.lfo1 = lfo1;
		const lfo2 = new LFO(audioContext);
		this.lfo2 = lfo2;
		this.lfos = [lfo1, lfo2];

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
		const vibrato = new Modulator(audioContext, lfo2, oscillator.frequency);
		this.vibrato = vibrato;
		vibrato.connect(samplePlaybackRate.offset);

		// Ring modulation
		const ringMod = audioContext.createGain();
		const ringInput = audioContext.createGain();
		ringInput.connect(ringMod.gain);
		ringInput.gain.value = 0;
		this.ringMod = ringMod;
		this.ringInput = ringInput;
		oscillatorGain.connect(ringMod);
		sampleGain.connect(ringMod);
		this.gains = [oscillatorGain, sampleGain];

		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;
		const filterLFO = new Modulator(audioContext, lfo1, filter.frequency);
		this.filterLFO = filterLFO;

		const filteredPath = audioContext.createGain();
		this.filteredPath = filteredPath;
		ringMod.connect(filteredPath);
		filteredPath.connect(filter);

		const unfilteredPath = audioContext.createGain();
		this.unfilteredPath = unfilteredPath;
		unfilteredPath.gain.value = 0;
		ringMod.connect(unfilteredPath);

		const tremoloGain = audioContext.createGain();
		const tremoloModulator = new Modulator(audioContext, lfo1, tremoloGain.gain);
		this.tremolo = tremoloModulator;
		filter.connect(tremoloGain);
		unfilteredPath.connect(tremoloGain);

		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;
		tremoloGain.connect(envelope);

		const panner = audioContext.createStereoPanner();
		this.panner = panner;
		envelope.connect(panner);

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
		this.filter.connect(node);
		this.unfilteredPath.connect(node);
		this.oscillator.connect(channel.syncGain, 1);
	}

	start(when) {
		if (!this.started) {
			this.lfo1.start(when);
			this.lfo2.start(when);
			this.started = true;
		}
	}

	calcEnvelope() {
		const params = this.parameters;
		const endAttack = params[Parameter.ATTACK];
		const endHold = endAttack + params[Parameter.HOLD];
		const endDecay = endHold + params[Parameter.DECAY];
		this.endAttack = endAttack / 1000;
		this.endHold = endHold / 1000;
		this.endDecay = endDecay / 1000;
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
	}

	gate(state, start) {
		const parameters = this.parameters;
		const delay = this.delay;
		const velocity = this.velocity;
		const sustainLevel = this.sustain;
		let endDecay, beginRelease, endTime;

		const playSample = parameters[Parameter.SOURCE] > 0;
		const velocityReduction = (100 - parameters[Parameter.VELOCITY]) / 100;
		const scaleAHD = 1 + parameters[Parameter.SCALE_AHD] * velocityReduction;
		const scaleRelease = 1 - parameters[Parameter.SCALE_RELEASE] * velocityReduction;
		const gain = this.envelope.gain;
		gain.cancelAndHoldAtTime(start);

		switch (state) {
		case Gate.OPEN:
			gain.setTargetAtTime(0.01, start - delay, delay * 2);
			gain.setValueAtTime(0.01, start);
			gain.linearRampToValueAtTime(velocity, start + scaleAHD * this.endAttack);
			this.triggerLFOs(start);
			gain.setValueAtTime(velocity, start + scaleAHD * this.endHold);
			gain[parameters[Parameter.DECAY_SHAPE]](sustainLevel, start + scaleAHD * this.endDecay);
			break;

		case Gate.CLOSED:
			endTime = start + scaleRelease * this.release;
			gain[parameters[Parameter.RELEASE_SHAPE]](NEARLY_ZERO, endTime - this.system.shortestTime);
			gain.setValueAtTime(0, endTime);
			if (this.samplePlayer !== undefined) {
				this.samplePlayer.stop(endTime);
				this.samplePlayer = undefined;
			}
			break;

		case Gate.TRIGGER:
			gain.setTargetAtTime(0.01, start - delay, delay * 2);
			gain.setValueAtTime(0.01, start);
			if (playSample) {
				this.playSample(start);
			}
			gain.linearRampToValueAtTime(velocity, start + scaleAHD * this.endAttack);
			this.triggerLFOs(start);
			gain.setValueAtTime(velocity, start + scaleAHD * this.endHold);
			endDecay = start + scaleAHD * this.endDecay;
			gain[parameters[Parameter.DECAY_SHAPE]](sustainLevel, endDecay);

			if (!playSample) {
				const duration = this.duration;
				if (duration > 0) {
					beginRelease = start + this.duration;
					if (endDecay < beginRelease) {
						gain.setValueAtTime(sustainLevel, beginRelease);
					} else {
						gain.cancelAndHoldAtTime(beginRelease);
					}
				} else {
					beginRelease = endDecay;
				}
				endTime = beginRelease + scaleRelease * this.release;
				gain[parameters[Parameter.RELEASE_SHAPE]](NEARLY_ZERO, endTime - this.system.shortestTime);
				gain.setValueAtTime(0, endTime);
			}
			break;

		case Gate.CUT:
			gain.setTargetAtTime(0, start, delay / 3);
			gain.setValueAtTime(0, start);
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

		let dirtyPWM = undefined; // holds change type
		let dirtyEnvelope = false;
		let dirtySustain = false;
		let dirtyFilterLFO = undefined;  // holds change type
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
			case Parameter.DELAY:
				this.delay = value / 1000;
				break;

			case Parameter.ATTACK:
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
					me.filterLFO.disconnect();
					me.lfos[value - 1].connect(me.filterLFO);
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

			case Parameter.TREMOLO_AMOUNT:
				this.tremolo.setMinMax(changeType, 1 - value / 100, 1, time);
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

			case Parameter.LFO1_RATE_MOD:
				this.lfo1.rateMod = value;
				break;

			case Parameter.LFO2_RATE_MOD:
				this.lfo2.rateMod = value;
				break;

			case Parameter.PAN:
				this.panner.pan.setValueAtTime(value / 100, time);
				break;

			case Parameter.SYNC:
				value = Math.trunc(Math.abs(value)) % 2;
				this.syncGain.gain.setValueAtTime(value, time);
				parameters[Parameter.SYNC] = value;
				break;

			case Parameter.SOURCE:
				if (value === 0 && gate === undefined) {
					const currentGate = parameters[Parameter.GATE];
					if (currentGate === Gate.TRIGGER) {
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

			case Parameter.FILTERED_AMOUNT:
				this.filteredPath.gain[changeType](value / 100, time);
				this.unfilteredPath.gain[changeType](1 - value / 100, time);
				break;

			case Parameter.FILTER_TYPE:
				callbacks.push(function () {
					me.filter.type = value;
				});
				break;

			case Parameter.FILTER_FREQUENCY:
				this.filterLFO.setMinMax(changeType, value, value, time);
				parameters[Parameter.MIN_FILTER_FREQUENCY] = value;
				parameters[Parameter.MAX_FILTER_FREQUENCY] = value;
				break;

			case Parameter.MIN_FILTER_FREQUENCY:
			case Parameter.MAX_FILTER_FREQUENCY:
				dirtyFilterLFO = changeType;
				break;

			case Parameter.Q:
				this.filter.Q[changeType](value, time);
				break;

			case Parameter.FILTER_GAIN:
				this.filter.gain[changeType](value, time);
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

			case Parameter.SAMPLE:
				this.playRateMultiplier.gain.setValueAtTime(this.system.getSamplePeriod(value), time);
				sampleChanged = true;
				break;

			case undefined:
				console.error('An undefined synthesizer parameter was used.');
				break;
			} // end switch
		} // end loop over each parameter

		if (dirtyPWM) {
			this.pwm.setMinMax(dirtyPWM, parameters[Parameter.MIN_PULSE_WIDTH] / 100, parameters[Parameter.MAX_PULSE_WIDTH] / 100, time);
		}
		if (dirtyEnvelope) {
			this.calcEnvelope();
		}
		if (dirtySustain) {
			this.sustain = volumeCurve(parameters[Parameter.VELOCITY] * parameters[Parameter.SUSTAIN] / 100);
		}
		if (dirtyFilterLFO) {
			this.filterLFO.setMinMax(dirtyFilterLFO, parameters[Parameter.MIN_FILTER_FREQUENCY], parameters[Parameter.MAX_FILTER_FREQUENCY], time);
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
						this.gate(Gate.TRIGGER, timeOfTick);
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
	Gate: Gate,
	Pattern: Chord,
	Param: Parameter,
	Source: Source,
	Waveform: Waveform,
	Modulator: Modulator,
	C64Oscillator: C64OscillatorNode,
	LogNode: LogNode,
	keymap: keymap,
	volumeCurve: volumeCurve,
};

})(window);
