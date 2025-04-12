import {
	Node,
	Symbol,
	ts,
	Type,
} from "ts-morph";

export interface Properties {
	[property: string]: ValidationSchema;
}

export interface ValidationSchema {
	type?: string | string[];
	required?: string[];
	properties?: Properties;
	items?: ValidationSchema;
	enum?: any[];
	format?: string;
	nullable?: boolean;
	description?: string;
	default?: any;
	additionalProperties?: boolean | ValidationSchema;
	allOf?: ValidationSchema[];
	oneOf?: ValidationSchema[];
	$ref?: string;
	// JSON Schema specific fields
	title?: string;
	$schema?: string;
	$id?: string;
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
}

// Store resolved schemas to avoid circular references
interface SchemaCache {
	schemas: Record<string, ValidationSchema>;
}

const schemaCache: SchemaCache = {
	schemas: {},
};

function buildRef(name: string): string {
	return `#/definitions/${name}`;
}

// Helper to extract documentation from JSDoc tags
function extractJSDocProperties(symbol: Symbol): Partial<ValidationSchema> {
	const result: Partial<ValidationSchema> = {};
	const jsDocTags = symbol.compilerSymbol.getJsDocTags();

	for (const tag of jsDocTags) {
		if (tag.name === "description" && tag.text) {
			result.description = tag.text
				.map((t) => t.text)
				.join("\n");
		} else if (tag.name === "format" && tag.text) {
			result.format = tag.text
				.map((t) => t.text)
				.join("");
		} else if (tag.name === "default" && tag.text) {
			try {
				// Try to parse as JSON if possible
				result.default = JSON.parse(tag.text.map((t) => t.text).join(""));
			} catch {
				// Otherwise use as string
				result.default = tag.text
					.map((t) => t.text)
					.join("");
			}
		} else if (
			["pattern", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].includes(tag.name)
			&& tag.text
		) {
			// Handle numeric constraint properties
			if (["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].includes(tag.name)) {
				result[tag.name as keyof ValidationSchema] = parseFloat(tag.text.map((t) => t.text).join(""));
			} else {
				result[tag.name as keyof ValidationSchema] = tag.text.map((t) => t.text).join("\n");
			}
		}
	}

	return result;
}

// Improved type name retrieval for better schema referencing
function retrieveTypeName(type: Type): string {
	if (type.isArray()) {
		return `Array_${retrieveTypeName(type.getArrayElementType()!)}`;
	}

	if (type.isIntersection()) {
		return `Intersection_${type.getIntersectionTypes().map((type) => retrieveTypeName(type)).join("_")}`;
	}

	if (type.isUnion()) {
		return `Union_${type.getUnionTypes().map((type) => retrieveTypeName(type)).join("_")}`;
	}

	const typeName = type.getSymbol()?.getName();
	if (typeof typeName === "undefined") {
		return type.getText();
	}

	if (typeName === "__type") {
		const aliasName = type.getAliasSymbol()?.getName();
		if (typeof aliasName !== "undefined" && aliasName !== "__type") {
			return aliasName;
		}

		// For more complex types, use a hash of the type text
		return `Anonymous_${hashCode(type.getText())}`;
	}

	return typeName;
}

// Simple string hash function
function hashCode(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
}

// Check if a type is a built-in complex type that should be simplified
function isBuiltInComplexType(type: Type): boolean {
	// Safety check
	if (!type || typeof type !== "object") return false;
	if (typeof type.getSymbol !== "function") return false;

	const symbol = type.getSymbol();
	if (!symbol || typeof symbol.getName !== "function") return false;

	const typeName = symbol.getName();
	if (!typeName) return false;

	// List of built-in types that should be simplified
	const builtInTypes = [
		"Number",
		"NumberConstructor",
		"String",
		"StringConstructor",
		"Boolean",
		"BooleanConstructor",
		"Date",
		"DateConstructor",
		"Function",
		"FunctionConstructor",
		"Object",
		"ObjectConstructor",
		"Array",
		"ArrayConstructor",
		"RegExp",
		"RegExpConstructor",
		"Error",
		"ErrorConstructor",
		"Map",
		"MapConstructor",
		"Set",
		"SetConstructor",
		"Symbol",
		"SymbolConstructor",
		"Promise",
		"PromiseConstructor",
	];

	return builtInTypes.includes(typeName);
}

// Enhanced primitive type detection
function isPrimitive(type: Type): boolean {
	// Check for direct primitive types
	if (type.isString() || type.isStringLiteral()) return true;
	if (type.isNumber() || type.isNumberLiteral()) return true;
	if (type.isBoolean() || type.isBooleanLiteral()) return true;
	if (type.isLiteral()) return true;

	// Check for enums which are essentially primitives with constraints
	if (type.isEnum() || type.isEnumLiteral()) return true;

	// Handle optional primitives (union with undefined or null)
	if (type.isUnion()) {
		const unionTypes = type.getUnionTypes();
		const nonNullableTypes = unionTypes.filter((t) =>
			!t.isUndefined() && !t.isNull() && !t.isUnknown() && !t.isAny()
		);

		// Check if all non-nullable types are primitives
		if (nonNullableTypes.length > 0 && nonNullableTypes.every(isPrimitive)) {
			return true;
		}

		// Check for string/number literal unions (which are essentially enums)
		if (nonNullableTypes.every((t) => t.isStringLiteral() || t.isNumberLiteral())) {
			return true;
		}
	}

	return false;
}

function isNullableType(type: Type): boolean {
	return type.isUndefined()
		|| type.isNull()
		|| type.isUnknown()
		|| type.isAny();
}

function areTypesNonNullable(symbol: Symbol): boolean {
	const types = symbol
		.getDeclarations()
		.map((d) => d.getType());

	return !types.some((type) => {
		if (isNullableType(type)) {
			return true;
		}

		if (type.isUnion()) {
			return type
				.getUnionTypes()
				.some(isNullableType);
		}

		return false;
	});
}

// Extract string literals from union types
function extractStringLiteralValues(type: Type): string[] | null {
	if (!type.isUnion()) return null;

	const stringLiterals: string[] = [];
	const unionTypes = type.getUnionTypes();

	for (const unionType of unionTypes) {
		if (unionType.isStringLiteral()) {
			// Get the actual string value without quotes
			stringLiterals.push(unionType.getLiteralValue() as string);
		} else if (!unionType.isUndefined() && !unionType.isNull()) {
			// If we find a non-string-literal type (other than undefined/null), return null
			// because this isn't a pure string literal union
			return null;
		}
	}

	return stringLiterals.length > 0 ? stringLiterals : null;
}

// Extract number literals from union types
function extractNumberLiteralValues(type: Type): number[] | null {
	if (!type.isUnion()) return null;

	const numberLiterals: number[] = [];
	const unionTypes = type.getUnionTypes();

	for (const unionType of unionTypes) {
		if (unionType.isNumberLiteral()) {
			numberLiterals.push(unionType.getLiteralValue() as number);
		} else if (!unionType.isUndefined() && !unionType.isNull()) {
			return null;
		}
	}

	return numberLiterals.length > 0 ? numberLiterals : null;
}

// Check if type is a Date
function isDateType(type: Type): boolean {
	const symbol = type.getSymbol();
	return symbol?.getName() === "Date";
}

// Better array detection
function isArrayType(type: Type): boolean {
	// Direct array type
	if (type.isArray()) return true;

	// Check for Array<T> generic type
	const symbol = type.getSymbol();
	if (symbol?.getName() === "Array") {
		return true;
	}

	// Check for ReadonlyArray, etc.
	if (type.getText().includes("Array<")) {
		return true;
	}

	return false;
}

// Handle mapped types like Partial, Omit, Pick, etc.
function handleMappedType(type: Type): string | null {
	const aliasSymbol = type.getAliasSymbol();
	if (!aliasSymbol) return null;

	const name = aliasSymbol.getEscapedName();
	if (["Partial", "Omit", "Pick", "Record", "Promise"].includes(name)) {
		return name;
	}

	return null;
}

// Handle nullable types
function resolveNullableType(nonNullableType: Type, isUndefined: boolean): ValidationSchema {
	const resolved = resolveType(nonNullableType);

	// JSON Schema standard way to handle nullable (draft 2019-09)
	if (resolved.type) {
		// If it already has a type, make it an array of types including 'null'
		if (Array.isArray(resolved.type)) {
			if (!resolved.type.includes("null")) {
				resolved.type.push("null");
			}
		} else {
			resolved.type = [resolved.type, "null"];
		}
	} else {
		// If no type is set, set nullable flag (for backward compatibility)
		resolved.nullable = true;
	}

	return resolved;
}

// Check if a type is a primitive or can be represented as a primitive
function isPrimitiveOrPrimitiveRepresentation(type: Type): boolean {
	// Direct primitives
	if (isPrimitive(type)) return true;

	// Literals
	if (type.isLiteral()) return true;

	// Check for null/undefined
	if (type.isNull() || type.isUndefined()) return true;

	return false;
}

// Check if a type is a Record with primitive values
function isRecordWithPrimitiveValues(type: Type): boolean {
	// Check if it's an object type with index signature
	if (!type.isObject()) return false;

	// Get string and number index types
	const stringIndexType = type.getStringIndexType();
	const numberIndexType = type.getNumberIndexType();

	// If no index signatures, it's not a Record type
	if (!stringIndexType && !numberIndexType) return false;

	// Check if the index value types are primitives
	if (stringIndexType && !isPrimitiveOrPrimitiveRepresentation(stringIndexType)) return false;
	if (numberIndexType && !isPrimitiveOrPrimitiveRepresentation(numberIndexType)) return false;

	return true;
}

// Improved function to handle potential union types with filtering of unknown types
function handlePotentialUnionType(type: Type): ValidationSchema | null {
	// Ensure the type is a union
	if (!type.isUnion()) return null;

	const unionTypes = type.getUnionTypes();
	const schemas: ValidationSchema[] = [];

	for (const unionType of unionTypes) {
		// Skip undefined types directly
		if (unionType.isUndefined()) continue;

		// Handle boolean types
		if (unionType.isBoolean()) {
			schemas.push({ type: "boolean" });
			continue;
		}

		// Handle string literal types
		if (unionType.isStringLiteral()) {
			const literalValue = unionType.getLiteralValue();
			schemas.push({ type: "string", enum: [literalValue] });
			continue;
		}

		// Handle array types
		if (unionType.isArray()) {
			const elementType = unionType.getArrayElementType();
			if (elementType) {
				const elementSchema = resolveType(elementType);
				schemas.push({ type: "array", items: elementSchema });
			} else {
				schemas.push({ type: "array", items: { type: "string" } });
			}
			continue;
		}

		// Handle other types recursively
		schemas.push(resolveType(unionType));
	}

	// Combine all schemas into a oneOf structure, filtering out unknown/undefined types
	const filteredSchemas = schemas.filter((schema) => {
		// Filter out schemas with "Unknown type: undefined" in the description
		if (
			schema.description
			&& (
				schema.description.includes("Unknown type: undefined")
				|| schema.description === "Unknown type (invalid object)"
			)
		) {
			return false;
		}

		// Filter out empty object schemas with no properties or references
		if (
			schema.type === "object"
			&& (!schema.properties || Object.keys(schema.properties).length === 0)
			&& !schema.$ref
			&& !schema.additionalProperties
		) {
			return false;
		}

		return true;
	});

	return filteredSchemas.length > 0 ? { oneOf: filteredSchemas } : null;
}

// Resolve a type to a schema - improved with better handling of primitive types and imports
function resolveType(type: Type): ValidationSchema {
	// Add defensive check for valid type object
	if (!type || typeof type !== "object") {
		return {
			type: "string",
			description: "Unknown type (invalid object)",
		};
	}

	// Get the type name for better schema representation
	const typeName = retrieveTypeName(type);

	// Handle primitive types
	if (type.isString() || type.isStringLiteral()) {
		return { type: "string", title: typeName };
	}
	if (type.isNumber() || type.isNumberLiteral()) {
		return { type: "number", title: typeName };
	}
	if (type.isBoolean() || type.isBooleanLiteral()) {
		return { type: "boolean", title: typeName };
	}

	// Handle arrays
	if (type.isArray()) {
		const elementType = type.getArrayElementType();
		return {
			type: "array",
			items: elementType ? resolveType(elementType) : { type: "string" },
			title: typeName,
		};
	}

	// Handle null and undefined
	if (type.isNull()) {
		return { type: "null", title: "null" };
	}
	if (type.isUndefined()) {
		return { type: "null", title: "undefined" };
	}

	// Handle mapped types like Partial<T>, etc.
	const mappedTypeName = handleMappedType(type);
	if (mappedTypeName) {
		return {
			type: "object",
			description: `${mappedTypeName} type`,
			title: typeName,
		};
	}

	// Handle objects and interfaces
	if (type.isObject() || type.isClassOrInterface()) {
		if (schemaCache.schemas[typeName]) {
			return { $ref: buildRef(typeName), title: typeName };
		}

		schemaCache.schemas[typeName] = { type: "object" }; // Prevent circular references
		const schema = resolveObjectSchema(type);
		schemaCache.schemas[typeName] = schema;
		return { $ref: buildRef(typeName), title: typeName };
	}

	// Handle unions
	if (type.isUnion()) {
		// Get all the union types and resolve them
		const unionTypes = type.getUnionTypes().map(resolveType);

		// Filter out unknown types or undefined types to simplify the schema
		const validUnionTypes = unionTypes.filter((schema) => {
			// Skip schemas with "Unknown type" in the description
			if (schema.description && schema.description.includes("Unknown type")) {
				return false;
			}

			// Skip empty objects with no properties
			if (
				schema.type === "object"
				&& (!schema.properties || Object.keys(schema.properties).length === 0)
				&& !schema.$ref
			) {
				return false;
			}

			return true;
		});

		// If after filtering we have only one type, return it directly instead of using oneOf
		if (validUnionTypes.length === 1) {
			// Return the single type with the original title
			return {
				...validUnionTypes[0],
				title: typeName,
			};
		}

		// Otherwise, return the oneOf with all valid types
		return {
			oneOf: validUnionTypes.length > 0 ? validUnionTypes : unionTypes,
			title: typeName,
		};
	}

	// Handle intersections
	if (type.isIntersection()) {
		return {
			allOf: type.getIntersectionTypes().map(resolveType),
			title: typeName,
		};
	}

	// Default fallback
	return {
		type: "object",
		description: `Unknown type: ${type.getText()}`,
		title: typeName,
	};
}

// Improved object schema resolution with better handling for imported types
function resolveObjectSchema(type: Type): ValidationSchema {
	// Get all properties
	const properties: Properties = {};
	const required: string[] = [];

	// Safety check
	if (!type || typeof type !== "object") {
		return {
			type: "object",
			description: "Unknown object (invalid type)",
		};
	}

	// First check for toJSON method which overrides normal object structure
	if (typeof type.getProperty === "function") {
		const toJSONProperty = type.getProperty("toJSON");
		if (toJSONProperty) {
			const declarations = toJSONProperty.getDeclarations();
			if (declarations && declarations.length > 0 && Node.isMethodDeclaration(declarations[0])) {
				const returnType = (declarations[0] as any).getReturnType();
				if (returnType) {
					return resolveType(returnType);
				}
			}
		}
	}

	// Process all properties if getProperties is available
	if (typeof type.getProperties === "function") {
		for (const property of type.getProperties()) {
			// Safety check for property
			if (!property) continue;

			const propName = property.getName();
			if (!propName) continue;

			// Skip methods/functions
			if (typeof property.getDeclarations !== "function") continue;

			const declarations = property.getDeclarations();
			if (!declarations || !declarations.length) continue;

			const declaration = declarations[0];

			// Skip if we can't get the property type
			if (typeof property.getTypeAtLocation !== "function") continue;

			const propType = property.getTypeAtLocation(declaration);
			if (!propType) continue;

			// Skip method declarations
			if (
				Node.isMethodDeclaration(declaration)
				|| (typeof propType.getCallSignatures === "function" && propType.getCallSignatures().length > 0)
			) {
				continue;
			}

			// Get JSDoc properties if possible
			const jsDocProps = typeof extractJSDocProperties === "function" ?
				extractJSDocProperties(property) :
				{};

			// Check if property is optional
			const isOptional = typeof property.hasFlags === "function"
				&& property.hasFlags(ts.SymbolFlags.Optional);

			if (!isOptional) {
				required.push(propName);
			}

			// Try to handle potential union types generically
			const propTypeText = propType.getText();

			// Check if this is potentially a union type that needs special handling
			const resolved = handlePotentialUnionType(propType);
			if (resolved) {
				properties[propName] = {
					...resolved,
					...jsDocProps,
				};
				continue;
			}

			// Resolve property type (recursive)
			const propSchema = resolveType(propType);

			// Add JSDoc properties
			properties[propName] = {
				...propSchema,
				...jsDocProps,
			};
		}
	}

	// Handle index signatures (like Record<string, any>) if methods are available
	if (typeof type.getStringIndexType === "function" || typeof type.getNumberIndexType === "function") {
		const stringIndexType = typeof type.getStringIndexType === "function" ? type.getStringIndexType() : undefined;
		const numberIndexType = typeof type.getNumberIndexType === "function" ? type.getNumberIndexType() : undefined;

		let additionalProperties;
		if (stringIndexType && (!stringIndexType.getText || stringIndexType.getText() !== "never")) {
			additionalProperties = resolveType(stringIndexType);
		} else if (numberIndexType && (!numberIndexType.getText || numberIndexType.getText() !== "never")) {
			additionalProperties = resolveType(numberIndexType);
		}

		if (additionalProperties) {
			return {
				type: "object",
				properties: properties,
				additionalProperties: additionalProperties,
				...(required.length > 0 ? { required } : {}),
			};
		}
	}

	// Return the object schema
	return {
		type: "object",
		properties: properties,
		...(required.length > 0 ? { required } : {}),
	};
}

export function resolveTypeSchema(propertyType: Type): Properties {
	// Clear schema cache for a fresh start
	schemaCache.schemas = {};

	// Get root properties - properly resolve the top-level object
	const schema = resolveObjectSchema(propertyType);

	// Combine schema properties and schema definitions for proper referencing
	const result: Properties = {};

	// Add all schema definitions to the result
	for (const [key, value] of Object.entries(schemaCache.schemas)) {
		result[key] = value;
	}

	// Add root schema properties
	if (schema.properties) {
		for (const [key, value] of Object.entries(schema.properties)) {
			result[key] = value;
		}
	}

	return result;
}
