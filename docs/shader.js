const shader = `
// Replace hardcoded values with uniforms
uniform float uPixelSizeFac;
uniform float uContrast;
uniform vec4 uColor1;  // First color
uniform vec4 uColor2;  // Second color
uniform vec4 uColor3;  // Third color
uniform float uSpinAmount;  // Spin amount parameter
uniform float uSpinEase;   // Spin ease parameter

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
     //Convert to UV coords (0-1) and floor for pixel effect
    float pixel_size = length(iResolution.xy)/uPixelSizeFac;
    vec2 uv = (floor(fragCoord.xy*(1.0/pixel_size))*pixel_size - 0.5*iResolution.xy)/length(iResolution.xy) - vec2(0.0, 0.0);
    float uv_len = length(uv);

    // Calculate transition over 5 seconds
    float transition = min(1.0, iTime * 0.2); // 5 second transition (1/5 = 0.2)
    
    // Adding in a center swirl, changes with iTime. Only applies meaningfully if the 'spin amount' is a non-zero number
    float speed = (iTime*uSpinEase*0.5) + 302.2;
    float new_pixel_angle = (atan(uv.y, uv.x)) + speed - uSpinEase*20.*(1.*uSpinAmount*uv_len + (1. - 1.*uSpinAmount));
    vec2 mid = (iResolution.xy/length(iResolution.xy))/2.;
    uv = (vec2((uv_len * cos(new_pixel_angle) + mid.x), (uv_len * sin(new_pixel_angle) + mid.y)) - mid);

    //Now add the paint effect to the swirled UV
    uv *= 25.;
    speed = iTime*(1.);
    vec2 uv2 = vec2(uv.x+uv.y);

    for(int i=0; i < 5; i++) {
        uv2 += uv + cos(length(uv));
        uv  += 0.5*vec2(cos(3.1123314 + 0.353*uv2.y + speed*0.131121),sin(uv2.x - 0.113*speed));
        uv  -= 1.0*cos(uv.x + uv.y) - 1.0*sin(uv.x*0.711 - uv.y);
    }

    //Make the paint amount range from 0 - 2
    float contrast_mod = (0.25*uContrast + 0.5*uSpinAmount + 1.2);
    float paint_res =min(2., max(0.,length(uv)*(0.035)*contrast_mod));
    float c1p = max(0.,1. - contrast_mod*abs(1.-paint_res));
    float c2p = max(0.,1. - contrast_mod*abs(paint_res));
    float c3p = 1. - min(1., c1p + c2p);
    
    // Use the transitioning colors in the final calculation
    vec4 ret_col = (0.3/uContrast)*uColor1 + 
                   (1. - 0.3/uContrast)*(uColor1*c1p + uColor2*c2p + 
                   vec4(c3p*uColor3.rgb, c3p*uColor1.a)) + 
                   0.3*max(c1p*5. - 4., 0.) + 
                   0.4*max(c2p*5. - 4., 0.);
    
    // Mix between white and colored result
    fragColor = mix(vec4(1.0), ret_col, transition);
}
`

class ShaderCanvas {
	constructor(canvas) {
		this.canvas = canvas;
		this.gl = canvas.getContext("webgl");
		if (!this.gl) throw new Error("WebGL not supported");

		// Add time simulation properties
		this.simulatedTime = null;
		this.isSimulating = false;

		// Function to get color based on time of day
		this.getTimeBasedColors = () => {
			const now = new Date();
			const hour = this.isSimulating ? this.simulatedTime.getHours() : now.getHours();
			const minute = this.isSimulating ? this.simulatedTime.getMinutes() : now.getMinutes();
			const time = hour + minute / 60;

			// Define color stops
			const colors = {
				night: [0.1, 0.1, 0.3, 1.0],    // Dark blue (before 7am)
				morning: [0.3, 0.5, 0.8, 1.0],  // Bright blue (7am-noon)
				noon: [0.9, 0.8, 0.2, 1.0],     // Yellow (noon-3pm)
				afternoon: [0.9, 0.5, 0.2, 1.0], // Orange (3pm-7pm)
				evening: [0.5, 0.2, 0.6, 1.0],  // Purple (7pm-9pm)
				lateNight: [0.1, 0.1, 0.3, 1.0] // Dark blue (after 9pm)
			};

			// Define transition times
			const transitions = {
				nightToMorning: 7,
				morningToNoon: 12,
				noonToAfternoon: 15,
				afternoonToEvening: 19,
				eveningToLateNight: 21
			};

			// Calculate transition progress
			let progress = 0;
			let color1, color2;

			if (time < transitions.nightToMorning) {
				progress = (time - (transitions.nightToMorning - 1)) / 1;
				color1 = colors.night;
				color2 = colors.morning;
			} else if (time < transitions.morningToNoon) {
				progress = (time - (transitions.morningToNoon - 5)) / 5;
				color1 = colors.morning;
				color2 = colors.noon;
			} else if (time < transitions.noonToAfternoon) {
				progress = (time - (transitions.noonToAfternoon - 3)) / 3;
				color1 = colors.noon;
				color2 = colors.afternoon;
			} else if (time < transitions.afternoonToEvening) {
				progress = (time - (transitions.afternoonToEvening - 4)) / 4;
				color1 = colors.afternoon;
				color2 = colors.evening;
			} else if (time < transitions.eveningToLateNight) {
				progress = (time - (transitions.eveningToLateNight - 2)) / 2;
				color1 = colors.evening;
				color2 = colors.lateNight;
			} else {
				progress = (time - (transitions.eveningToLateNight + 3)) / 3;
				color1 = colors.lateNight;
				color2 = colors.night;
			}

			// Ensure progress is between 0 and 1
			progress = Math.max(0, Math.min(1, progress));

			// Interpolate between colors
			return [
				color1[0] + (color2[0] - color1[0]) * progress,
				color1[1] + (color2[1] - color1[1]) * progress,
				color1[2] + (color2[2] - color1[2]) * progress,
				1.0
			];
		};

		// Add time simulation methods
		this.simulateTime = (hour, minute = 0) => {
			this.isSimulating = true;
			this.simulatedTime = new Date();
			this.simulatedTime.setHours(hour, minute, 0, 0);
		};

		this.useRealTime = () => {
			this.isSimulating = false;
			this.simulatedTime = null;
		};

		// Add keyboard controls for testing
		this.setupTimeControls = () => {
			document.addEventListener('keydown', (e) => {
				switch(e.key) {
					case '1': this.simulateTime(5); break;  // 5 AM
					case '2': this.simulateTime(7); break;  // 7 AM
					case '3': this.simulateTime(12); break; // Noon
					case '4': this.simulateTime(15); break; // 3 PM
					case '5': this.simulateTime(19); break; // 7 PM
					case '6': this.simulateTime(21); break; // 9 PM
					case '0': this.useRealTime(); break;    // Use real time
				}
			});
		};

		this.uniforms = {
			iTime: 0,
			iResolution: [canvas.width, canvas.height],
			iMouse: [0, 0],
			uColor1: this.getTimeBasedColors(),  // Primary color based on time
			uColor2: [0.5, 0.85, 1.00, 1.0],  // light blue
			uColor3: [0.0, 0.0, 0.0, 1.0],  // Black
			uSpinAmount: 3.5,  // Starting spin amount
			uSpinEase: 0.07,   // Starting spin ease
			uContrast: 0.6,    // Starting contrast
			uPixelSizeFac: 350.0  // Starting pixel size factor
		};

		// Store vertex shader source for reuse
		this.vertexShaderSource = `attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

		this.initWebGL();
		this.setupEventListeners();
		this.setupTimeControls(); // Add time controls setup
		this.startTime = Date.now();
	}

	initWebGL(frag) {
		// Vertex shader - renders a fullscreen quad
		const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, this.vertexShaderSource);

		// Default fragment shader
		const fragmentShader = this.compileShader(
			this.gl.FRAGMENT_SHADER,
			`precision highp float; void main() { gl_FragColor = vec4(1., 0., 1., 1.); }`
		);

		// Create shader program
		this.program = this.createProgram(vertexShader, fragmentShader);

		// Create fullscreen quad
		const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
		const buffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

		// Setup attributes and uniforms
		const position = this.gl.getAttribLocation(this.program, "position");
		this.gl.enableVertexAttribArray(position);
		this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);

		// Store uniform locations
		this.uniformLocations = {
			iTime: this.gl.getUniformLocation(this.program, "iTime"),
			iResolution: this.gl.getUniformLocation(this.program, "iResolution"),
			iMouse: this.gl.getUniformLocation(this.program, "iMouse"),
			uColor1: this.gl.getUniformLocation(this.program, "uColor1"),
			uColor2: this.gl.getUniformLocation(this.program, "uColor2"),
			uColor3: this.gl.getUniformLocation(this.program, "uColor3"),
			uSpinAmount: this.gl.getUniformLocation(this.program, "uSpinAmount"),
			uSpinEase: this.gl.getUniformLocation(this.program, "uSpinEase"),
			uContrast: this.gl.getUniformLocation(this.program, "uContrast"),
			uPixelSizeFac: this.gl.getUniformLocation(this.program, "uPixelSizeFac")
		};
	}

	createProgram(vertexShader, fragmentShader) {
		const program = this.gl.createProgram();
		this.gl.attachShader(program, vertexShader);
		this.gl.attachShader(program, fragmentShader);
		this.gl.linkProgram(program);

		if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
			throw new Error("Unable to initialize shader program: " + this.gl.getProgramInfoLog(program));
		}

		return program;
	}

	compileShader(type, source) {
		const shader = this.gl.createShader(type);
		this.gl.shaderSource(shader, source);
		this.gl.compileShader(shader);

		if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
			throw new Error("Shader compile error: " + this.gl.getShaderInfoLog(shader));
		}

		return shader;
	}

	setupEventListeners() {
		this.canvas.addEventListener("mousemove", (e) => {
			const rect = this.canvas.getBoundingClientRect();
			this.uniforms.iMouse[0] = e.clientX - rect.left;
			this.uniforms.iMouse[1] = this.canvas.height - (e.clientY - rect.top);
		});

		window.addEventListener("resize", () => {
			this.resize();
		});
	}

	resize() {
		const pixelRatio = window.devicePixelRatio || 1;
		const rect = this.canvas.getBoundingClientRect();

		// Set the canvas size in pixels
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight

		// Update uniforms with the new dimensions
		this.uniforms.iResolution = [this.canvas.width, this.canvas.height];

		// Update the viewport
		this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
	}

	setFragmentShader(frag) {
		const source = `
      precision highp float;
      uniform float iTime;
      uniform vec2 iResolution;
      uniform vec2 iMouse;
      varying vec2 vUv;

      ${frag}

      void main() {
        mainImage(gl_FragColor, gl_FragCoord.xy);
      }
    `;

		try {
			// Compile new fragment shader
			const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, source);
			// Compile fresh vertex shader (since we can't reuse the old one)
			const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, this.vertexShaderSource);

			// Create new program
			const newProgram = this.createProgram(vertexShader, fragmentShader);

			// Clean up old program
			if (this.program) {
				this.gl.deleteProgram(this.program);
			}

			// Switch to new program
			this.program = newProgram;

			// Update uniform locations
			this.uniformLocations = {
				iTime: this.gl.getUniformLocation(this.program, "iTime"),
				iResolution: this.gl.getUniformLocation(this.program, "iResolution"),
				iMouse: this.gl.getUniformLocation(this.program, "iMouse"),
				uColor1: this.gl.getUniformLocation(this.program, "uColor1"),
				uColor2: this.gl.getUniformLocation(this.program, "uColor2"),
				uColor3: this.gl.getUniformLocation(this.program, "uColor3"),
				uSpinAmount: this.gl.getUniformLocation(this.program, "uSpinAmount"),
				uSpinEase: this.gl.getUniformLocation(this.program, "uSpinEase"),
				uContrast: this.gl.getUniformLocation(this.program, "uContrast"),
				uPixelSizeFac: this.gl.getUniformLocation(this.program, "uPixelSizeFac")
			};

			// Re-setup attributes
			const position = this.gl.getAttribLocation(this.program, "position");
			this.gl.enableVertexAttribArray(position);
			this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);
		} catch (e) {
			console.warn(source);
			console.error("Shader compilation error:", e);
		}
	}

	render() {
		this.uniforms.iTime = (Date.now() - this.startTime) / 1000;
		
		// Update colors based on time
		this.uniforms.uColor1 = this.getTimeBasedColors();
		
		this.gl.useProgram(this.program);

		// Update all uniforms
		this.gl.uniform1f(this.uniformLocations.iTime, this.uniforms.iTime);
		this.gl.uniform2fv(this.uniformLocations.iResolution, this.uniforms.iResolution);
		this.gl.uniform2fv(this.uniformLocations.iMouse, this.uniforms.iMouse);
		this.gl.uniform4fv(this.uniformLocations.uColor1, this.uniforms.uColor1);
		this.gl.uniform4fv(this.uniformLocations.uColor2, this.uniforms.uColor2);
		this.gl.uniform4fv(this.uniformLocations.uColor3, this.uniforms.uColor3);
		this.gl.uniform1f(this.uniformLocations.uSpinAmount, this.uniforms.uSpinAmount);
		this.gl.uniform1f(this.uniformLocations.uSpinEase, this.uniforms.uSpinEase);
		this.gl.uniform1f(this.uniformLocations.uContrast, this.uniforms.uContrast);
		this.gl.uniform1f(this.uniformLocations.uPixelSizeFac, this.uniforms.uPixelSizeFac);

		// Draw
		this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

		requestAnimationFrame(() => this.render());
	}
}

// new ShaderCanvas(canvas).setFragmentShader(shader);
shaderCanvas = new ShaderCanvas(canvas);
// Make sure to resize immediately after creation
shaderCanvas.resize();
shaderCanvas.setFragmentShader(shader);
shaderCanvas.render();