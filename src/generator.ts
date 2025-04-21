import fs from "node:fs";
import path from "node:path";

import Handlebars from "handlebars";
import { Project } from "ts-morph";

import { resolveTypeSchema } from "./resolver.js";

// NOTE: Handlebars helpers
Handlebars.registerHelper("json", function(context) {
	return JSON.stringify(context, null, 4);
});

Handlebars.registerHelper("typeOf", function(value) {
	return typeof value;
});

export interface GenerateOptions {
	tsconfigFilePath: string;
	templateFile?: string;
	validator: {
		inputFile: string;
		outputFile: string;
		variableName?: string;
	};
}

export function generate(options: GenerateOptions): void {
	// Set up the TypeScript project
	const project = new Project({
		tsConfigFilePath: options.tsconfigFilePath,
	});

	// Add the source file to the project
	const sourceFile = project.addSourceFileAtPath(options.validator.inputFile);

	// Get the config variable
	const confVariableName = options.validator.variableName ?? "config";
	const confVariable = sourceFile.getVariableDeclarationOrThrow(confVariableName);
	const confType = confVariable.getType();

	// Resolve the schema from the type - get both properties and schema definitions
	const schemas = resolveTypeSchema(confType);

	// Load the template file (either from user option or default)
	const templatePath = options.templateFile || path.resolve(import.meta.dirname, "./template.hbs");

	if (!fs.existsSync(templatePath)) {
		throw new Error(`Template file not found: ${templatePath}`);
	}

	const template = fs.readFileSync(templatePath, "utf-8");

	// Compile the template with all schemas
	const compiledTemplate = Handlebars.compile(template);
	const result = compiledTemplate({ schemas });

	// Create output directory if it doesn't exist
	const outputDir = path.dirname(options.validator.outputFile);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Write the result to the output file
	fs.writeFileSync(options.validator.outputFile, result);
}
