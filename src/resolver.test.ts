import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
	afterEach,
	beforeEach,
	describe,
	it,
} from "node:test";

import { Project } from "ts-morph";

import { resolveTypeSchema } from "./resolver.js";

const FIXTURES = path.join(process.cwd(), "src", "fixtures");
const TSCONFIG_PATH = path.join(process.cwd(), "tsconfig.json");

// Global project instance to be reused across tests
let project;

// Helper function to get types
function getTypeFromCode(
	sourceCode: string | NodeJS.ArrayBufferView<ArrayBufferLike>,
	variableName: string,
): any {
	// Create a temporary file with the code
	const tempFilePath = path.join(FIXTURES, "temp.ts");
	fs.writeFileSync(tempFilePath, sourceCode);

	// Add the source file to the existing project
	project.addSourceFileAtPath(tempFilePath);
	const sourceFile = project.getSourceFileOrThrow(tempFilePath);

	// Get the variable and its type
	const variable = sourceFile.getVariableDeclarationOrThrow(variableName);
	return variable.getType();
}

describe("Resolver Tests", () => {
	// Setup project once before all tests
	beforeEach(() => {
		// Create test directory if it doesn't exist
		if (!fs.existsSync(FIXTURES)) {
			fs.mkdirSync(FIXTURES, { recursive: true });
		}

		// Create project once for all tests
		if (!project) {
			project = new Project({
				tsConfigFilePath: TSCONFIG_PATH,
			});
		}
	});

	afterEach(() => {
		// Clean up temporary files
		const tempFile = path.join(FIXTURES, "temp.ts");
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
			// Remove temp source file from project to avoid memory issues
			const sourceFile = project.getSourceFile(tempFile);
			if (sourceFile) {
				project.removeSourceFile(sourceFile);
			}
		}
	});

	// Group similar tests into batches to reduce overhead
	describe("primitive types", () => {
		it("can resolve primitive and simple types", () => {
			const sourceCode = `
				export const stringVar = "test";
				export const numberVar = 42;
				export const booleanVar = true;
				export const nullVar: null = null;
				export const undefinedVar: undefined = undefined;
			`;

			// Test multiple primitive types in a single test
			const stringType = getTypeFromCode(sourceCode, "stringVar");
			const stringSchema = resolveTypeSchema(stringType);
			assert.ok(stringSchema);

			const numberType = getTypeFromCode(sourceCode, "numberVar");
			const numberSchema = resolveTypeSchema(numberType);
			assert.ok(numberSchema);

			const booleanType = getTypeFromCode(sourceCode, "booleanVar");
			const booleanSchema = resolveTypeSchema(booleanType);
			assert.ok(booleanSchema);

			const nullType = getTypeFromCode(sourceCode, "nullVar");
			const nullSchema = resolveTypeSchema(nullType);
			assert.ok(nullSchema);

			const undefinedType = getTypeFromCode(sourceCode, "undefinedVar");
			const undefinedSchema = resolveTypeSchema(undefinedType);
			assert.ok(undefinedSchema);
		});

		it("can resolve literal types", () => {
			const sourceCode = `
				export const literalStringVar: "specific" = "specific";
				export const literalNumberVar: 42 = 42;
				export const literalBooleanVar: true = true;
				export const symbolVar: symbol = Symbol("test");
				export const bigintVar: bigint = 100n;
			`;

			const literalStringType = getTypeFromCode(sourceCode, "literalStringVar");
			const stringSchema = resolveTypeSchema(literalStringType);
			assert.ok(stringSchema);

			const literalNumberType = getTypeFromCode(sourceCode, "literalNumberVar");
			const numberSchema = resolveTypeSchema(literalNumberType);
			assert.ok(numberSchema);

			const literalBooleanType = getTypeFromCode(sourceCode, "literalBooleanVar");
			const booleanSchema = resolveTypeSchema(literalBooleanType);
			assert.ok(booleanSchema);

			const symbolType = getTypeFromCode(sourceCode, "symbolVar");
			const symbolSchema = resolveTypeSchema(symbolType);
			assert.ok(symbolSchema);

			const bigintType = getTypeFromCode(sourceCode, "bigintVar");
			const bigintSchema = resolveTypeSchema(bigintType);
			assert.ok(bigintSchema);
		});
	});

	describe("object types", () => {
		it("can resolve object types", () => {
			const sourceCode = `
				export const objVar = {
					name: "test",
					count: 42,
					isValid: true
				};
			`;

			const objType = getTypeFromCode(sourceCode, "objVar");
			const schema = resolveTypeSchema(objType);

			assert.ok(schema);
		});

		it("can resolve nested object types", () => {
			const sourceCode = `
				export const nestedObjVar = {
					name: "test",
					metadata: {
						created: "2023-01-01",
						version: 1
					}
				};
			`;

			const nestedType = getTypeFromCode(sourceCode, "nestedObjVar");
			const schema = resolveTypeSchema(nestedType);

			assert.ok(schema);
		});

		it("can resolve object with optional properties", () => {
			const sourceCode = `
				interface TestType {
					required: string;
					optional?: number;
				}
				
				export const objectWithOptional: TestType = {
					required: "test"
				};
			`;

			const objType = getTypeFromCode(sourceCode, "objectWithOptional");
			const schema = resolveTypeSchema(objType);

			assert.ok(schema);
		});

		it("can resolve object with mixed required and optional properties", () => {
			const sourceCode = `
				interface ComplexType {
					id: number;
					name: string;
					description?: string;
					metadata?: {
						created: Date;
						modified?: Date;
					};
					tags?: string[];
				}
				
				export const complexVar: ComplexType = {
					id: 1,
					name: "test",
					metadata: {
						created: new Date()
					}
				};
			`;

			const complexType = getTypeFromCode(sourceCode, "complexVar");
			const schema = resolveTypeSchema(complexType);
			assert.ok(schema);
		});

		it("can resolve complex indexable types", () => {
			const sourceCode = `
				interface Dictionary {
					[key: string]: any;
					id: number;
					name: string;
				}
				
				export const dictVar: Dictionary = {
					id: 1,
					name: "test",
					customField1: "value1",
					customField2: 42,
					nestedObject: { prop: true }
				};
			`;

			const dictType = getTypeFromCode(sourceCode, "dictVar");
			const schema = resolveTypeSchema(dictType);

			assert.ok(schema);
		});
	});

	describe("array types", () => {
		it("can resolve array types", () => {
			const sourceCode = `
				export const arrayVar = ["a", "b", "c"];
			`;

			const arrayType = getTypeFromCode(sourceCode, "arrayVar");
			const schema = resolveTypeSchema(arrayType);

			assert.ok(schema);
		});

		it("can resolve array of objects", () => {
			const sourceCode = `
				export const arrayOfObjects = [
					{ id: 1, name: "Item 1" },
					{ id: 2, name: "Item 2" }
				];
			`;

			const arrayType = getTypeFromCode(sourceCode, "arrayOfObjects");
			const schema = resolveTypeSchema(arrayType);

			assert.ok(schema);
		});

		it("can resolve arrays with union types", () => {
			const sourceCode = `
				export const mixedArrayVar: (string | number)[] = ["test", 42, "another"];
			`;

			const mixedArrayType = getTypeFromCode(sourceCode, "mixedArrayVar");
			const schema = resolveTypeSchema(mixedArrayType);
			assert.ok(schema);
		});

		it("can resolve arrays with readonly modifier", () => {
			const sourceCode = `
				export const readonlyArrayVar: readonly string[] = ["a", "b", "c"];
			`;

			const readonlyArrayType = getTypeFromCode(sourceCode, "readonlyArrayVar");
			const schema = resolveTypeSchema(readonlyArrayType);
			assert.ok(schema);
		});
	});

	describe("union types", () => {
		it("can resolve union types", () => {
			const sourceCode = `
				export const unionVar: string | number = "test";
			`;

			const unionType = getTypeFromCode(sourceCode, "unionVar");
			const schema = resolveTypeSchema(unionType);

			assert.ok(schema);
		});

		it("can handle nullable types", () => {
			const sourceCode = `
				export const nullableVar: string | null = "test";
			`;

			const nullableType = getTypeFromCode(sourceCode, "nullableVar");
			const schema = resolveTypeSchema(nullableType);

			assert.ok(schema);
		});

		it("can resolve enum-like union types", () => {
			const sourceCode = `
				export const enumLikeVar: "red" | "green" | "blue" = "red";
			`;

			const enumType = getTypeFromCode(sourceCode, "enumLikeVar");
			const schema = resolveTypeSchema(enumType);

			assert.ok(schema);
		});

		it("can resolve complex union types", () => {
			const sourceCode = `
				type ComplexUnion = 
					| string
					| number
					| { type: "object", value: any }
					| [string, number]
					| null
					| undefined;
				
				export const complexUnionVar: ComplexUnion = { type: "object", value: 42 };
			`;

			const complexUnionType = getTypeFromCode(sourceCode, "complexUnionVar");
			const schema = resolveTypeSchema(complexUnionType);
			assert.ok(schema);
		});
	});

	// Batch remaining tests into logical groups
	describe("special types", () => {
		it("can resolve tuple types and variations", () => {
			const sourceCode = `
				export const tupleVar: [string, number, boolean] = ["test", 42, true];
				export const optionalTupleVar: [string, number, boolean?] = ["test", 42];
				export const restTupleVar: [string, ...number[]] = ["test", 1, 2, 3];
			`;

			const tupleType = getTypeFromCode(sourceCode, "tupleVar");
			const schema = resolveTypeSchema(tupleType);
			assert.ok(schema);

			const optionalTupleType = getTypeFromCode(sourceCode, "optionalTupleVar");
			const optSchema = resolveTypeSchema(optionalTupleType);
			assert.ok(optSchema);

			const restTupleType = getTypeFromCode(sourceCode, "restTupleVar");
			const restSchema = resolveTypeSchema(restTupleType);
			assert.ok(restSchema);
		});

		it("can resolve enum types", () => {
			const sourceCode = `
				enum Color {
					Red = "RED",
					Green = "GREEN",
					Blue = "BLUE"
				}
				
				enum Direction {
					Up, // 0
					Down, // 1
					Left, // 2
					Right // 3
				}
				
				enum Mixed {
					A = 0,
					B = "string",
					C = 2
				}
				
				export const enumVar: Color = Color.Red;
				export const numericEnumVar: Direction = Direction.Up;
				export const mixedEnumVar: Mixed = Mixed.B;
			`;

			const enumType = getTypeFromCode(sourceCode, "enumVar");
			const schema = resolveTypeSchema(enumType);
			assert.ok(schema);

			const numericEnumType = getTypeFromCode(sourceCode, "numericEnumVar");
			const numericSchema = resolveTypeSchema(numericEnumType);
			assert.ok(numericSchema);

			const mixedEnumType = getTypeFromCode(sourceCode, "mixedEnumVar");
			const mixedSchema = resolveTypeSchema(mixedEnumType);
			assert.ok(mixedSchema);
		});

		it("can resolve special collection types", () => {
			const sourceCode = `
				export const dateVar: Date = new Date();
				export const mapVar: Map<string, number> = new Map();
				export const setVar: Set<string> = new Set();
				export const promiseVar: Promise<string> = Promise.resolve("test");
			`;

			const dateType = getTypeFromCode(sourceCode, "dateVar");
			const dateSchema = resolveTypeSchema(dateType);
			assert.ok(dateSchema);

			const mapType = getTypeFromCode(sourceCode, "mapVar");
			const mapSchema = resolveTypeSchema(mapType);
			assert.ok(mapSchema);

			const setType = getTypeFromCode(sourceCode, "setVar");
			const setSchema = resolveTypeSchema(setType);
			assert.ok(setSchema);

			const promiseType = getTypeFromCode(sourceCode, "promiseVar");
			const promiseSchema = resolveTypeSchema(promiseType);
			assert.ok(promiseSchema);
		});

		it("can resolve any and unknown types", () => {
			const sourceCode = `
				export const anyVar: any = { whatever: "anything" };
				export const unknownVar: unknown = "something";
			`;

			const anyType = getTypeFromCode(sourceCode, "anyVar");
			const anySchema = resolveTypeSchema(anyType);
			assert.ok(anySchema);

			const unknownType = getTypeFromCode(sourceCode, "unknownVar");
			const unknownSchema = resolveTypeSchema(unknownType);
			assert.ok(unknownSchema);
		});
	});

	describe("advanced type operations", () => {
		it("can resolve function types", () => {
			const sourceCode = `
				export const funcVar: (a: number, b: string) => boolean = () => true;
			`;

			const funcType = getTypeFromCode(sourceCode, "funcVar");
			const schema = resolveTypeSchema(funcType);

			assert.ok(schema);
		});

		it("can resolve intersection types", () => {
			const sourceCode = `
				type A = { a: string };
				type B = { b: number };
				export const intersectionVar: A & B = { a: "test", b: 42 };
			`;

			const intersectionType = getTypeFromCode(sourceCode, "intersectionVar");
			const schema = resolveTypeSchema(intersectionType);

			assert.ok(schema);
		});

		it("can resolve types with type aliases", () => {
			const sourceCode = `
				type ID = string;
				type UserRole = "admin" | "user" | "guest";
				
				interface User {
					id: ID;
					role: UserRole;
				}
				
				export const userVar: User = {
					id: "user123",
					role: "admin"
				};
			`;

			const userType = getTypeFromCode(sourceCode, "userVar");
			const schema = resolveTypeSchema(userType);

			assert.ok(schema);
		});

		it("can resolve utility types", () => {
			const sourceCode = `
				interface User {
					id: number;
					name: string;
					email: string;
					role: string;
					password: string;
				}
				
				export const partialUserVar: Partial<User> = {
					id: 1,
					name: "test"
				};
				
				export const pickedUserVar: Pick<User, "id" | "name"> = {
					id: 1,
					name: "test"
				};
				
				export const omittedUserVar: Omit<User, "password"> = {
					id: 1,
					name: "test",
					email: "test@example.com",
					role: "user"
				};
				
				interface Config {
					debug?: boolean;
					verbose?: boolean;
					logLevel?: string;
				}
				
				export const requiredConfigVar: Required<Config> = {
					debug: true,
					verbose: false,
					logLevel: "info"
				};
			`;

			const partialUserType = getTypeFromCode(sourceCode, "partialUserVar");
			const partialSchema = resolveTypeSchema(partialUserType);
			assert.ok(partialSchema);

			const pickedUserType = getTypeFromCode(sourceCode, "pickedUserVar");
			const pickedSchema = resolveTypeSchema(pickedUserType);
			assert.ok(pickedSchema);

			const omittedUserType = getTypeFromCode(sourceCode, "omittedUserVar");
			const omittedSchema = resolveTypeSchema(omittedUserType);
			assert.ok(omittedSchema);

			const requiredConfigType = getTypeFromCode(sourceCode, "requiredConfigVar");
			const requiredSchema = resolveTypeSchema(requiredConfigType);
			assert.ok(requiredSchema);
		});

		it("can resolve conditional types", () => {
			const sourceCode = `
				type IsString<T> = T extends string ? true : false;
				
				export const isStringVar: IsString<string> = true;
				export const isNotStringVar: IsString<number> = false;
			`;

			const isStringType = getTypeFromCode(sourceCode, "isStringVar");
			const isStringSchema = resolveTypeSchema(isStringType);
			assert.ok(isStringSchema);

			const isNotStringType = getTypeFromCode(sourceCode, "isNotStringVar");
			const isNotStringSchema = resolveTypeSchema(isNotStringType);
			assert.ok(isNotStringSchema);
		});
	});

	describe("complex nested types", () => {
		it("can resolve complex nested types", () => {
			const sourceCode = `
				interface NestedTypes {
					simple: string;
					complex: {
						array: Array<{
							id: number;
							tags: string[];
							metadata?: Record<string, any>;
						}>;
						union: string | number | boolean;
						optional?: Date;
					};
				}
				
				export const nestedTypesVar: NestedTypes = {
					simple: "test",
					complex: {
						array: [
							{ id: 1, tags: ["a", "b"] },
							{ id: 2, tags: [], metadata: { created: "2023" } }
						],
						union: "test"
					}
				};
			`;

			const nestedTypesType = getTypeFromCode(sourceCode, "nestedTypesVar");
			const schema = resolveTypeSchema(nestedTypesType);
			assert.ok(schema);
		});

		it("can resolve record types", () => {
			const sourceCode = `
				export const recordVar: Record<string, number> = {
					a: 1,
					b: 2,
					c: 3
				};
			`;

			const recordType = getTypeFromCode(sourceCode, "recordVar");
			const schema = resolveTypeSchema(recordType);
			assert.ok(schema);
		});

		it("can resolve recursive types", () => {
			const sourceCode = `
				interface TreeNode {
					value: string;
					children?: TreeNode[];
				}
				
				export const treeVar: TreeNode = {
					value: "root",
					children: [
						{
							value: "child1"
						},
						{
							value: "child2",
							children: [{ value: "grandchild" }]
						}
					]
				};
			`;

			const treeType = getTypeFromCode(sourceCode, "treeVar");
			const schema = resolveTypeSchema(treeType);

			assert.ok(schema);
		});

		it("can resolve custom class types", () => {
			const sourceCode = `
				class User {
					id: number;
					name: string;
					private secret: string;
					
					constructor(id: number, name: string) {
						this.id = id;
						this.name = name;
						this.secret = "private";
					}
					
					getInfo() {
						return { id: this.id, name: this.name };
					}
				}
				
				export const classVar = new User(1, "test");
			`;

			const classType = getTypeFromCode(sourceCode, "classVar");
			const schema = resolveTypeSchema(classType);
			assert.ok(schema);
		});

		it("can resolve interface inheritance", () => {
			const sourceCode = `
				interface Base {
					id: number;
				}
				
				interface Extended extends Base {
					name: string;
				}
				
				export const inheritedVar: Extended = {
					id: 1,
					name: "test"
				};
			`;

			const inheritedType = getTypeFromCode(sourceCode, "inheritedVar");
			const schema = resolveTypeSchema(inheritedType);
			assert.ok(schema);
		});

		it("can resolve readonly properties", () => {
			const sourceCode = `
				interface ReadonlyProps {
					readonly id: number;
					name: string;
				}
				
				export const readonlyVar: ReadonlyProps = {
					id: 1,
					name: "test"
				};
			`;

			const readonlyType = getTypeFromCode(sourceCode, "readonlyVar");
			const schema = resolveTypeSchema(readonlyType);
			assert.ok(schema);
		});

		it("can resolve index signatures with specific return types", () => {
			const sourceCode = `
				interface StringMap {
					[key: string]: string;
				}
				
				export const stringMapVar: StringMap = {
					key1: "value1",
					key2: "value2"
				};
			`;

			const stringMapType = getTypeFromCode(sourceCode, "stringMapVar");
			const schema = resolveTypeSchema(stringMapType);
			assert.ok(schema);
		});

		it("can resolve generic types", () => {
			const sourceCode = `
				interface Box<T> {
					value: T;
				}
				
				export const stringBoxVar: Box<string> = { value: "test" };
				export const numberBoxVar: Box<number> = { value: 42 };
			`;

			const stringBoxType = getTypeFromCode(sourceCode, "stringBoxVar");
			const stringBoxSchema = resolveTypeSchema(stringBoxType);
			assert.ok(stringBoxSchema);

			const numberBoxType = getTypeFromCode(sourceCode, "numberBoxVar");
			const numberBoxSchema = resolveTypeSchema(numberBoxType);
			assert.ok(numberBoxSchema);
		});
	});
});
