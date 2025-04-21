import path from "node:path";

import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions.js";

import { generate } from "../../src/generator.js";

generate({
	tsconfigFilePath: path.join(import.meta.dirname, "./tsconfig.json"),
	validator: {
		variableName: "config",
		inputFile: path.join(import.meta.dirname, "./index.ts"),
		outputFile: path.join(import.meta.dirname, "./validator.ts"),
	},
});

// @ts-ignore: Runtime generated
const { validator } = await import("./validator.js");

const config = {
	database: {
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
config.database.port = "5432";
// 👇👇
// [
// 	{
// 		path: "db.port",
// 		value: "5432",
// 		expected: "number",
// 	},
// ];

console.log(validator.check(config));
