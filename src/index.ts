import type { TagToken, LiqeQuery } from "liqe";
import type { Sql } from "sql-template-tag";
import sql, { join } from "sql-template-tag";

export type FieldConfig = Array<{
  /**
   * The column to query against for this field
   */
  column: Sql;
  /**
   * This function determines if this field config should be
   * used for the given tag token.
   */
  matcher: (tag: TagToken) => boolean;
  /**
   * If omitted or if the serializer returns `null`, use the default serializer.
   * TODO: Add a way to gather parse errors from the serializer
   *
   * @param column The column to query against for this field. This is the same
   * as the `column` property.
   * @param tag The tag token to serialize.
   * @returns The serialized tag token, or null to fallback to the default
   */
  serializer?: (column: Sql, tag: TagToken) => Sql | null;
}>;

export const makeSerializer = (config: FieldConfig) => {
  const serializeTag = makeTagSerializer(config);

  return function serialize(ast: LiqeQuery): Sql {
    switch (ast.type) {
      case "Tag":
        return serializeTag(ast);
      case "LogicalExpression": {
        const op = ast.operator.operator === "AND" ? sql`AND` : sql`OR`;
        return sql`(${serialize(ast.left)} ${op} ${serialize(ast.right)})`;
      }
      case "UnaryOperator":
        return sql`NOT ${serialize(ast.operand)}`;
      case "ParenthesizedExpression":
        return sql`(${serialize(ast.expression)})`;
      default:
        throw new Error(`Unexpected ${ast.type}`);
    }
  };
};

const makeTagSerializer =
  (config: FieldConfig) =>
  (tag: TagToken): Sql => {
    const cfg = config.find((c) => c.matcher(tag));
    if (cfg == null) {
      const { field: f } = tag;
      const field = f.type === "ImplicitField" ? f.type : f.name;
      throw new Error(`'Unsupported field: ${field}`);
    }
    const { column, serializer } = cfg;
    return serializer?.(column, tag) ?? defaultTagSerializer(column, tag);
  };

const defaultTagSerializer = (column: Sql, tag: TagToken): Sql => {
  const { field: f, operator: op, expression: exp } = tag;
  switch (exp.type) {
    case "LiteralExpression": {
      if (exp.value == null) {
        return sql`${column} IS NULL`;
      } else if (typeof exp.value === "boolean") {
        return sql`${column} = ${exp.value}`;
      } else if (op?.operator === ":<") {
        return sql`${column} < ${exp.value}`;
      } else if (op?.operator === ":>") {
        return sql`${column} > ${exp.value}`;
      } else if (op?.operator === ":<=") {
        return sql`${column} <= ${exp.value}`;
      } else if (op?.operator === ":>=") {
        return sql`${column} >= ${exp.value}`;
      } else if (op?.operator === ":=") {
        return sql`${column} = ${exp.value}`;
      } else {
        let value: Sql | string;
        const normed = exp.value.replace(/\*+/g, "*").replace(/^\*|\*$/g, "");
        if (normed.includes("*")) {
          // wildcard search
          // an expression like "foo*bar" maps to "CONCAT('%', ?, '%', ?, '%')"
          const parts = normed.split("*").reduce(
            (_parts, p, i, a) => {
              _parts.push(
                i < a.length - 1 ? sql` ${p}, '%'` : sql` ${p}, '%')`
              );
              return _parts;
            },
            [sql`CONCAT('%'`]
          );
          value = join(parts);
        } else {
          value = `%${exp.value}%`;
        }

        return exp.quoted
          ? sql`${column} LIKE ${value}` // case sensitive
          : sql`LOWER(${column}) LIKE LOWER(${value})`; // case insensitive
      }
    }
    case "RangeExpression": {
      const {
        range: { max, min, maxInclusive, minInclusive },
      } = exp;
      const minOp = minInclusive ? sql`>=` : sql`>`;
      const maxOp = maxInclusive ? sql`<=` : sql`<`;
      return sql`(${column} ${minOp} ${min} AND ${column} ${maxOp} ${max})`;
    }
    case "RegexExpression": {
      throw new Error(`Unsupported ${exp.type}`);
    }
    case "EmptyExpression": {
      throw new Error(`Unexpected ${exp.type}`);
    }
  }
};
