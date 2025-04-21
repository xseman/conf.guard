import path from "node:path";

import express from "express";
import nconf from "nconf";

import { generate } from "../../src/generator.js";

interface ServerConfig {
	port: number;
	host: string;
}

interface DatabaseConfig {
	host: string;
	port: number;
	username: string;
	password: string;
	name: string;
}

interface Config {
	server: ServerConfig;
	database: DatabaseConfig;
}

generate({
	tsconfigFilePath: path.join(import.meta.dirname, "./tsconfig.json"),
	validator: {
		variableName: "config",
		inputFile: path.join(import.meta.dirname, "./index.ts"),
		outputFile: path.join(import.meta.dirname, "./validator.ts"),
	},
});

const config = nconf
	.env("__") // Environment variables might make missconfiguration
	.file("config.json") // This file might make missconfiguration
	.defaults({
		server: {
			port: 3000,
			host: "localhost",
		},
		database: {
			host: "localhost",
			port: 5432,
		},
	}).get() as Config;

// @ts-ignore: Import generated validator dynamically
const { validator } = await import("./validator.js");

// @ts-ignore: simulate missconfiguration
config.server.host = true;
// 👇👇
// [
// 	{
// 		path: "server.host",
// 		value: true,
// 		expected: "string",
// 	},
// ];

// Validate configuration at runtime
const validationErrors = validator.check(config);
console.log("Validation:", validationErrors);

// Recover from validation errors or exit...

// Create Express app
const app = express();

app.listen(
	config.server.port,
	config.server.host,
	() => {
		console.log(`Server running at http://${config.server.host}:${config.server.port}`);
	},
);
