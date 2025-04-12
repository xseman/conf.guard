import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
	after,
	before,
	beforeEach,
	describe,
	it,
} from "node:test";

import { generate } from "./generator.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

// Create test directory if it doesn't exist
if (!fs.existsSync(FIXTURES)) {
	fs.mkdirSync(FIXTURES, { recursive: true });
}

describe("End-to-End Generator Tests", () => {
	const inputFile = path.join(FIXTURES, "input.ts");
	const outputFile = path.join(FIXTURES, "output.ts");
	const tsConfigFile = path.join(FIXTURES, "tsconfig.json");
	const customTemplatePath = path.join(FIXTURES, "custom-template.hbs");

	// Setup test environment once before all tests
	before(() => {
		// Create a shared tsconfig.json file for all tests
		const tsConfig = {
			compilerOptions: {
				target: "ES2020",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				esModuleInterop: true,
				strict: true,
				outDir: "./dist",
			},
			include: ["**/*.ts"],
			exclude: ["node_modules"],
		};

		fs.writeFileSync(tsConfigFile, JSON.stringify(tsConfig, null, 2));

		// Create a custom template file for testing the template option
		const customTemplate = `
		/* Custom template file */
		export class CustomValidator {
			{{#each schemas}}
			// {{@key}} schema
			{{/each}}
			
			validate(config: unknown): string[] {
				return ["Validation not implemented in test template"];
			}
		}
		
		export const validator = new CustomValidator();
		`;
		fs.writeFileSync(customTemplatePath, customTemplate);

		// Cleanup any existing output file
		if (fs.existsSync(outputFile)) {
			fs.unlinkSync(outputFile);
		}
	});

	// Cleanup after tests
	after(() => {
		// Optionally clean up test files after tests
		// Commented out to allow inspection of generated files
		// if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
		// if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
		// if (fs.existsSync(tsConfigFile)) fs.unlinkSync(tsConfigFile);
		// if (fs.existsSync(customTemplatePath)) fs.unlinkSync(customTemplatePath);
	});

	// Helper function to write source code to input file
	function writeSourceToInput(sourceCode) {
		fs.writeFileSync(inputFile, sourceCode);
	}

	// Helper function to clean up output file between tests
	function cleanupOutput() {
		if (fs.existsSync(outputFile)) {
			fs.unlinkSync(outputFile);
		}
	}

	// Helper function to generate validator with default options
	function generateValidator(options = {}) {
		return generate({
			tsconfigFilePath: tsConfigFile,
			inputFile: inputFile,
			outputFile: outputFile,
			variableName: "config",
			...options,
		});
	}

	// Helper to check basic output validity
	function verifyOutputBasics() {
		// Check that output file was created
		assert.ok(fs.existsSync(outputFile));

		// Check contents of generated file
		const generatedCode = fs.readFileSync(outputFile, "utf-8");

		// Basic check that output contains validator class
		assert.ok(generatedCode.includes("class"));
		assert.ok(generatedCode.includes("validator"));

		return generatedCode;
	}

	beforeEach(() => {
		// Clean up output file between tests
		cleanupOutput();
	});

	it("generates schema validator from basic types", () => {
		// Create a simple config type and instance
		const sourceCode = `
      export type ServerConfig = {
        host: string;
        port: number;
        debug: boolean;
        envMode: "development" | "staging" | "production";
        maxConnections?: number;
      };
      
      export const config: ServerConfig = {
        host: "localhost",
        port: 3000,
        debug: true,
        envMode: "development"
      };
    `;

		writeSourceToInput(sourceCode);

		// Generate schema validator
		generateValidator();

		// Check output validity
		const generatedCode = verifyOutputBasics();

		// Specific checks for this test case
		assert.ok(generatedCode.includes('"host"'));
		assert.ok(generatedCode.includes('"port"'));
		assert.ok(generatedCode.includes('"debug"'));
		assert.ok(generatedCode.includes('"envMode"'));
		assert.ok(generatedCode.includes('"development"'));
		assert.ok(generatedCode.includes('"staging"'));
		assert.ok(generatedCode.includes('"production"'));
	});

	it("generates schema validator with nested objects", () => {
		// Create config with nested objects
		const sourceCode = `
      export type ConfigWithNested = {
        name: string;
        settings: {
          timeout: number;
          retries: number;
        };
      };
      
      export const config: ConfigWithNested = {
        name: "simple-app",
        settings: {
          timeout: 1000,
          retries: 3
        }
      };
    `;

		writeSourceToInput(sourceCode);

		// Generate schema validator with verbose option
		generateValidator({ verbose: true });

		// Check output validity
		const generatedCode = verifyOutputBasics();

		// Specific checks for nested properties
		assert.ok(generatedCode.includes("settings"));
		assert.ok(generatedCode.includes("timeout"));
		assert.ok(generatedCode.includes("retries"));
	});

	it("uses a custom template file when specified", () => {
		// Use a simple type for this test
		const sourceCode = `
      export type SimpleConfig = {
        name: string;
      };
      
      export const config: SimpleConfig = {
        name: "test-app"
      };
    `;

		writeSourceToInput(sourceCode);

		// Generate schema validator with custom template
		generateValidator({ templateFile: customTemplatePath });

		// Check output validity
		const generatedCode = verifyOutputBasics();

		// Verify custom template was used
		assert.ok(generatedCode.includes("/* Custom template file */"));
		assert.ok(generatedCode.includes("CustomValidator"));
		assert.ok(!generatedCode.includes("ConfigValidator"));
	});

	it("throws an error when template file is not found", () => {
		// Use a simple type for this test
		const sourceCode = `
      export type SimpleConfig = {
        name: string;
      };
      
      export const config: SimpleConfig = {
        name: "test-app"
      };
    `;

		writeSourceToInput(sourceCode);

		// Attempt to generate with a non-existent template file
		assert.throws(() => {
			generateValidator({
				templateFile: path.join(FIXTURES, "non-existent-template.hbs"),
			});
		}, /Template file not found/);
	});

	it("throws an error when specified variable is not found", () => {
		// Create a config file without the expected variable
		const sourceCode = `
      export type SimpleConfig = {
        name: string;
      };
      
      export const differentName: SimpleConfig = {
        name: "test-app"
      };
    `;

		writeSourceToInput(sourceCode);

		// Attempt to generate with a variable name that doesn't exist
		assert.throws(() => {
			generateValidator();
		}, /Expected to find variable declaration named 'config'/);
	});

	it("creates output directory if it doesn't exist", () => {
		// Create a simple config
		const sourceCode = `
      export const config = {
        name: "test-app"
      };
    `;

		writeSourceToInput(sourceCode);

		// New output file in a non-existent directory
		const nestedOutputDir = path.join(FIXTURES, "nested", "dir");
		const nestedOutputFile = path.join(nestedOutputDir, "output.ts");

		// Ensure directory doesn't exist before the test
		if (fs.existsSync(nestedOutputDir)) {
			fs.rmSync(nestedOutputDir, { recursive: true, force: true });
		}

		// Generate with output in non-existent directory
		generate({
			tsconfigFilePath: tsConfigFile,
			inputFile: inputFile,
			outputFile: nestedOutputFile,
			variableName: "config",
		});

		// Check that directory and file were created
		assert.ok(fs.existsSync(nestedOutputDir));
		assert.ok(fs.existsSync(nestedOutputFile));

		// Cleanup
		fs.rmSync(nestedOutputDir, { recursive: true, force: true });
	});
});
