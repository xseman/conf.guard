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
	inputFile: string;
	outputFile: string;
	variableName?: string;
	templateFile?: string;
}

export function generate(opt: GenerateOptions): void {
	// Set up the TypeScript project
	const project = new Project({
		tsConfigFilePath: opt.tsconfigFilePath,
	});

	// Add the source file to the project
	const sourceFile = project.addSourceFileAtPath(opt.inputFile);

	// Get the config variable
	const confVariableName = opt.variableName ?? "config";
	const confVariable = sourceFile.getVariableDeclarationOrThrow(confVariableName);
	const confType = confVariable.getType();

	// Resolve the schema from the type - get both properties and schema definitions
	const schemas = resolveTypeSchema(confType);

	// Load the template file (either from user option or default)
	const templatePath = opt.templateFile || path.resolve(import.meta.dirname, "./template.hbs");

	if (!fs.existsSync(templatePath)) {
		throw new Error(`Template file not found: ${templatePath}`);
	}

	const template = fs.readFileSync(templatePath, "utf-8");

	// Compile the template with all schemas
	const compiledTemplate = Handlebars.compile(template);
	const result = compiledTemplate({ schemas });

	// Create output directory if it doesn't exist
	const outputDir = path.dirname(opt.outputFile);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Write the result to the output file
	fs.writeFileSync(opt.outputFile, result);
}
