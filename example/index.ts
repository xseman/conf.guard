import path from "node:path";

import { generate } from "../generator.js";

generate({
	tsconfigFilePath: path.join(import.meta.dirname, "./tsconfig.json"),
	inputFile: path.join(import.meta.dirname, "./index.ts"),
	outputFile: path.join(import.meta.dirname, "./check.ts"),
	variableName: "config",
});

// @ts-ignore: Runtime generated
const { validator } = await import("./check.js");

interface Foo {
	bar: number;
	baz: string;
}

const config = {
	foo: {
		bar: 1,
		baz: "baz",
	} as Foo,
};

// @ts-ignore: This will fail the validation
// config.foo.bar = "bar";

console.log(validator.validate(config));
