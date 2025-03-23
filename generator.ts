import fs from "node:fs";

import Handlebars from "handlebars";
import { Project } from "ts-morph";

import { resolveTypeSchema } from "./schemaResolver.js";

// NOTE: Handlebars helpers
Handlebars.registerHelper("json", function(context) {
	return JSON.stringify(context, null, 4);
});

export interface GenerateOptions {
	tsconfigFilePath: string;
	inputFile: string;
	outputFile: string;
	variableName?: string;
}

export function generate(opt: GenerateOptions): void {
	const project = new Project({
		tsConfigFilePath: opt.tsconfigFilePath,
	});

	const sourceFile = project.addSourceFileAtPath(opt.inputFile);

	const confVariableName = opt.variableName ?? "config";
	const confVariable = sourceFile.getVariableDeclarationOrThrow(confVariableName);
	const confType = confVariable.getType();

	const schemas = resolveTypeSchema(confType);

	const template = fs.readFileSync("./template.hbs", "utf-8");
	const compiledTemplate = Handlebars.compile(template);
	const result = compiledTemplate({ schemas: schemas });

	fs.writeFileSync(opt.outputFile, result);
}
