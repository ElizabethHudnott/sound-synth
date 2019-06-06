(function(global) {
'use strict';

const Parameter = Synth.enumFromArray([
	'X_VALUES',		// x-coordinates
	'Y_VALUES',		// y-coordinates
	'ENABLED',		// 0 or 1
]);

class PiecewiseLinear extends Machine {
	constructor(audioContext, oversampling) {
		super([
			[0, 1],		// x-coordinates
			[-1, 1],	// y-coordinates
			1,			// enabled
		]);

		const shaper = new WaveShaperNode(audioContext);
		shaper.oversample = oversampling;
		this.shaper = shaper;
		this.shape = null;
		this.inputs = [shaper];
		this.outputs = [shaper];
	}

	setParameters(changes, time) {
		const me = this;
		const callbacks = [];
		let newShape = false;
		for (let change of changes) {
			if (change.machine !== this) {
				continue;
			}
			let value;

			switch (change.parameterNumber) {
			case Parameter.X_VALUES:
			case Parameter.Y_VALUES:
				newShape = true;
				break;

			case Parameter.ENABLED:
				value = Math.trunc(Math.abs(change.value)) % 2;
				this.parameters[Parameter.ENABLED] = value;
				callbacks.push(function () {
					me.shaper.curve = value === 1 ? me.shape : null;
				});
				break;

			case undefined:
				console.error('PiecewiseLinear: An undefined machine parameter was used.');
				break;
			}
		}
		if (newShape) {
			const shape = this.calculateShapeFromCoordinates();
			callbacks.push(function () {
				me.shaper.curve = shape;
				me.shape = shape;
			});
		}
		return callbacks;
	}

	calculateShapeFromCoordinates() {
		const xValues = this.parameters[Parameter.X_VALUES];
		const yValues = this.parameters[Parameter.Y_VALUES];
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
}

PiecewiseLinear.Param = Parameter;
global.Machines.PiecewiseLinear = PiecewiseLinear;

})(window);
