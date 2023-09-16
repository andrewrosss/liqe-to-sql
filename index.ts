import {
  ComparisonOperatorToken,
  FieldToken,
  ImplicitFieldToken,
  LiqeQuery,
  LiteralExpressionToken,
  parse as parseLiqe,
} from "liqe";
import sql, { Sql } from "sql-template-tag";

type FieldConfig = {
  /**
   * The column to query against for this field
   */
  column: Sql;

  /**
   * This function determines if this field config should be
   * used for the given field token.
   */
  matcher: (field: FieldToken | ImplicitFieldToken) => boolean;

  /**
   * This function determines how to build the condition expression
   * using the given column, operator, and expression.
   */
  conditionExpression: (
    column: Sql,
    operator: ComparisonOperatorToken,
    expression: LiteralExpressionToken
  ) => Sql;
};

const FIELDS: FieldConfig[] = [
  // implicit field
  {
    column: sql`allFields`,
    matcher: (field) => field.type === "ImplicitField",
    conditionExpression: defaultConditionExpression,
  },

  // url
  {
    column: sql`urlFields`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["u", "url"].includes(field.name.toLowerCase()),
    conditionExpression: defaultConditionExpression,
  },

  // slug
  {
    column: sql`slug`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["s", "slug"].includes(field.name.toLowerCase()),
    conditionExpression: defaultConditionExpression,
  },

  // host
  {
    column: sql`hostFields`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["h", "host"].includes(field.name.toLowerCase()),
    conditionExpression: defaultConditionExpression,
  },

  // title
  {
    column: sql`titleFields`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["t", "title"].includes(field.name.toLowerCase()),
    conditionExpression: defaultConditionExpression,
  },

  // notes
  {
    column: sql`hasNotes`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["hasnotes"].includes(field.name.toLowerCase()),
    conditionExpression: defaultConditionExpression,
  },

  // collection
  {
    column: sql`collectionNames`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["c", "collection"].includes(field.name.toLowerCase()),
    conditionExpression: (column, operator, expression) => {
      const value = `%${JSON.stringify(expression.value)}%`;
      return sql`LOWER(${column}) LIKE LOWER(${value})`;
    },
  },

  // createdAt
  {
    column: sql`createdAt`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["created", "createdat"].includes(field.name.toLowerCase()),
    conditionExpression: defaultConditionExpression,
  },

  // updatedAt
  {
    column: sql`updatedAt`,
    matcher: (field) =>
      field.type !== "ImplicitField" &&
      ["updated", "updatedat"].includes(field.name.toLowerCase()),
    conditionExpression: defaultConditionExpression,
  },
];

function defaultConditionExpression(
  column: Sql,
  operator: ComparisonOperatorToken,
  expression: LiteralExpressionToken
): Sql {
  if (operator != null && operator.operator !== ":") {
    if (operator?.operator === ":<") {
      return sql`${column} < ${expression.value}`;
    } else if (operator?.operator === ":>") {
      return sql`${column} > ${expression.value}`;
    } else if (operator?.operator === ":<=") {
      return sql`${column} <= ${expression.value}`;
    } else if (operator?.operator === ":>=") {
      return sql`${column} >= ${expression.value}`;
    } else if (operator?.operator === ":=") {
      return sql`${column} = ${expression.value}`;
    } else {
      throw new Error(`Unexpected operator ${operator.operator}`);
    }
  }

  const value = `%${expression.value}%`;
  if (expression.quoted) {
    return sql`${column} LIKE ${value} COLLATE utf8mb4_bin`; // case sensitive
  } else {
    return sql`LOWER(${column}) LIKE LOWER(${value})`; // case insensitive
  }
}

export const serializeTag = (ast: LiqeQuery & { type: "Tag" }): Sql => {
  const { field, expression, operator } = ast;

  if (expression.type !== "LiteralExpression") {
    throw new Error("Unexpected expression");
  }

  const config = FIELDS.find((cfg) => cfg.matcher(field)) ?? FIELDS[0]!;
  const column = config.column;
  const condition = config.conditionExpression(column, operator, expression);

  return condition;
};

export const serialize = (ast: LiqeQuery): Sql => {
  if (ast.type === "Tag") {
    return serializeTag(ast);
  }

  if (ast.type === "LogicalExpression") {
    let op: Sql;

    if (ast.operator.operator === "AND") {
      op = sql`AND`;
    } else if (ast.operator.operator === "OR") {
      op = sql`OR`;
    } else {
      throw new Error("Unexpected operator");
    }

    return sql`(${serialize(ast.left)} ${op} ${serialize(ast.right)})`;
  }

  if (ast.type === "UnaryOperator") {
    return sql`NOT ${serialize(ast.operand)}`;
  }

  if (ast.type === "ParenthesizedExpression") {
    return sql`(${serialize(ast.expression)})`;
  }

  throw new Error("Unexpected expression");
};

export const parse = (query: string): LiqeQuery => {
  try {
    return parseLiqe(query);
  } catch (err) {
    if (err instanceof Error && err.message === "Found no parsings.") {
      // the parser seems to not handle strings with numbers very well, so
      // we fallback to quoting if we get an error saying "Found no parsings."
      return parseLiqe(`"${query}"`);
    }
    throw err;
  }
};
