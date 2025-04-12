import path from "node:path";

import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions.js";

import { generate } from "../src/generator.js";

generate({
	tsconfigFilePath: path.join(import.meta.dirname, "./tsconfig.json"),
	inputFile: path.join(import.meta.dirname, "./index.ts"),
	outputFile: path.join(import.meta.dirname, "./check.ts"),
	variableName: "config",
});

// @ts-ignore: Runtime generated
const { validator } = await import("./check.js");

const config = {
	db: {
		type: "postgres",
		port: 5432,
		host: "localhost",
		username: "postgres",
		password: "postgres",
		database: "postgres",
		logging: false,
		synchronize: false,
		subscribers: [],
		migrations: [],
	} as PostgresConnectionOptions,
};

// @ts-ignore: This will fail the validation
config.db.port = "5432";

console.log(validator.check(config));
