import { Symbol, Type } from "ts-morph";

interface Properties {
	[property: string]: ValidationSchema
}

interface ValidationSchema {
	type: string;
	required?: string[];
	properties?: Properties;
	items?: ValidationSchema;
};

function isPrimitive(type: Type): boolean {
	if (type.isLiteral()) return true;
	if (type.isString()) return true;
	if (type.isStringLiteral()) return true;
	if (type.isNumber()) return true;
	if (type.isNumberLiteral()) return true;
	if (type.isBoolean()) return true;
	if (type.isBooleanLiteral()) return true;
	return false;
}

function isNullableType(type: Type): boolean {
	return type.isUndefined() || 
		   type.isNull() || 
		   type.isUnknown() || 
		   type.isAny();
}

function areTypesNonNullable(symbol: Symbol): boolean {
	const types = symbol
		.getDeclarations()
		.map(d => d.getType());

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

export function resolveTypeSchema(propertyType: Type): Properties {
	propertyType.getFlags()

	const properties = propertyType.getProperties();
	const result: Properties = {};
	
	for (const prop of properties) {

		// External types
		if (prop.getValueDeclaration()?.getType().getText().includes("import")) {
			const type = prop.getValueDeclaration()?.getType();

			if (type && !isPrimitive(type)) {
				const props = resolveTypeSchema(type);
				const requiredProps = type.getProperties()
					.filter(areTypesNonNullable)
					.map((p) => p.getName());

				result[prop.getName()] = {
					type: "object",
					required: requiredProps,
					properties: props,
				};
			}

			continue;
		}

		// NOTE: just one declaration
		let declaredValues = prop.getDeclarations();

		// TODO: if has external type recursively resolve
		if (declaredValues.length > 1) {
			const type = prop.getDeclarations()
				.map(d => d.getType())
				.flat()
				.reduce((acc, curr) => {
					const unionTypes = curr.isUnion() ? curr.getUnionTypes() : [curr];
					for (const subType of unionTypes) {
						const base = subType.getBaseTypeOfLiteralType();
						
						if (base.isUndefined() || base.isNull() || base.isUnknown() || base.isAny()) {
							continue;
						}

						acc.add(base.getText());
					}
					return acc;
				}, new Set<string>());

			const aggregatedType = Array.from(type).join(" | ");

			result[prop.compilerSymbol.name] = {
				type: aggregatedType,
			};

			continue;
		}

		const declaredPropertyType = declaredValues[0].getType();

		if (declaredPropertyType.isArray()) {
			const elementType = declaredPropertyType.getArrayElementTypeOrThrow();

			if (isPrimitive(elementType) && !elementType.isUnionOrIntersection()) {
				result[prop.compilerSymbol.name] = {
					type: "array",
					items: {
						type: elementType.getText(),
					},
				};

				continue;
			}

			if (elementType.isObject() && !elementType.isUnionOrIntersection()) {
				const itemsData = resolveTypeSchema(elementType);
				const requiredProps = declaredPropertyType.getProperties()
					.filter(areTypesNonNullable)
					.map((p) => p.getName());
	
				result[prop.compilerSymbol.name] = {
					type: "array",
					items: {
						type: "object",
						required: requiredProps,
						properties: itemsData,
					},
				};

				continue;
			}

			// TODO: improve resolving complex types
			result[prop.compilerSymbol.name] = {
				type: "array",
				items: {
					type: "any",
				},
			};

			continue;
		}

		if (declaredPropertyType.isUnion()) {
			const types = declaredPropertyType.getUnionTypes();
			const hasPrimitive = types.some(isPrimitive);

			if (!hasPrimitive) {
				continue;
			}

			const type = prop.getDeclarations()
				.map(d => d.getType())
				.flat()
				.reduce((acc, curr) => {
					const unionTypes = curr.isUnion() ? curr.getUnionTypes() : [curr];
					for (const subType of unionTypes) {
						const base = subType.getBaseTypeOfLiteralType();
						
						if (base.isUndefined() || base.isNull() || base.isUnknown() || base.isAny()) {
							continue;
						}

						acc.add(base.getText());
					}
					return acc;
				}, new Set<string>());

			const aggregatedType = Array.from(type).join(" | ");

			result[prop.compilerSymbol.name] = {
				type: aggregatedType,
			};

			continue;
		}

		if (isPrimitive(declaredPropertyType)) {
			result[prop.compilerSymbol.name] = {
				type: declaredPropertyType.getText(),
			};

			continue;
		}

		if (
			declaredPropertyType.isAny() ||
			declaredPropertyType.isNull() ||
			declaredPropertyType.isUnknown() ||
			declaredPropertyType.isUndefined()
		) {
			result[prop.compilerSymbol.name] = {
				type: declaredPropertyType.getText(),
			};

			continue;
		}

		if (declaredPropertyType.isObject()) {
			const props = resolveTypeSchema(declaredPropertyType);
			const requiredProps = declaredPropertyType.getProperties()
				.filter(areTypesNonNullable)
				.map((p) => p.getName());

			result[prop.compilerSymbol.name] = {
				type: "object",
				required: requiredProps,
				properties: props,
			};

			continue;
		}

		// NOTE: also boolean is union type
		// NOTE: optional properties are union type with undefined
		if (declaredPropertyType.isUnion()) {
			const types = declaredPropertyType.getUnionTypes();
			const hasPrimitive = types.some(isPrimitive);

			if (!hasPrimitive) {
				continue;
			}
		}

		result[prop.getName()] = {
			type: declaredPropertyType.getText(),
		};
	}

	return result;
}
