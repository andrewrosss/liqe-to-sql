import type { FieldConfig } from "@/index";
import { expect, test } from "bun:test";
import { parse } from "liqe";
import sql from "sql-template-tag";

import { makeSerializer } from "@/index";

const config: FieldConfig = [
  {
    column: sql`all_fields`,
    matcher: (tag) => tag.field.type === "ImplicitField",
  },
  {
    column: sql`name`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "name",
  },
  {
    column: sql`full_name`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "full name",
  },
  {
    column: sql`first_name`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "name.first",
  },
  {
    column: sql`member`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "member",
  },
  {
    column: sql`height`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "height",
  },
  {
    column: sql`date`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "date",
  },
  {
    column: sql`bio`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "bio",
  },
  {
    column: sql`foo`,
    matcher: (tag) =>
      tag.field.type !== "ImplicitField" && tag.field.name === "foo",
  },
];
const serialize = makeSerializer(config);

// search for "foo" term anywhere in the document (case insensitive)
test(`foo`, () =>
  expect(serialize(parse(`foo`)).sql).toBe("LOWER(all_fields) LIKE LOWER(?)"));

// search for "foo" term anywhere in the document (case sensitive)
test(`'foo'`, () =>
  expect(serialize(parse(`'foo'`)).sql).toBe("all_fields LIKE ?"));
test(`"foo"`, () =>
  expect(serialize(parse(`"foo"`)).sql).toBe("all_fields LIKE ?"));

// search for "foo" term in `name` field
test(`name:foo`, () =>
  expect(serialize(parse(`name:foo`)).sql).toBe("LOWER(name) LIKE LOWER(?)"));

// search for "foo" term in `full name` field
test(`'full name':foo`, () =>
  expect(serialize(parse(`'full name':foo`)).sql).toBe(
    "LOWER(full_name) LIKE LOWER(?)"
  ));
test(`"full name":foo`, () =>
  expect(serialize(parse(`"full name":foo`)).sql).toBe(
    "LOWER(full_name) LIKE LOWER(?)"
  ));

// search for "foo" term in `first` field, member of `name`, i.e.
// matches {name: {first: 'foo'}}
test(`name.first:foo`, () =>
  expect(serialize(parse(`name.first:foo`)).sql).toBe(
    "LOWER(first_name) LIKE LOWER(?)"
  ));

// search using regex
test(`name:/foo/`, () =>
  expect(() => serialize(parse(`name:/foo/`))).toThrow());
test(`name:/foo/i`, () =>
  expect(() => serialize(parse(`name:/foo/i`))).toThrow());

// search using wildcard
test(`name:foo*bar`, () =>
  expect(serialize(parse(`name:foo*bar`)).sql).toBe(
    "LOWER(name) LIKE LOWER(CONCAT('%', ?, '%', ?, '%'))"
  ));

// boolean search
test(`member:true`, () =>
  expect(serialize(parse(`member:true`)).sql).toBe("member = ?"));
test(`member:false`, () =>
  expect(serialize(parse(`member:false`)).sql).toBe("member = ?"));

// null search
test(`member:null`, () =>
  expect(serialize(parse(`member:null`)).sql).toBe("member IS NULL"));

// search for age =, >, >=, <, <=
test(`height:=100`, () =>
  expect(serialize(parse(`height:=100`)).sql).toBe("height = ?"));
test(`height:>-100.512`, () =>
  expect(serialize(parse(`height:>-100.512`)).sql).toBe("height > ?"));
test(`date:>="2023-01-02"`, () =>
  expect(serialize(parse(`date:>="2023-01-02"`)).sql).toBe("date >= ?"));
test(`height:<100`, () =>
  expect(serialize(parse(`height:<100`)).sql).toBe("height < ?"));
test(`height:<=100`, () =>
  expect(serialize(parse(`height:<=100`)).sql).toBe("height <= ?"));

// search for height in range (inclusive, exclusive)
test(`height:[100 TO 200]`, () =>
  expect(serialize(parse(`height:[100 TO 200]`)).sql).toBe(
    "(height >= ? AND height <= ?)"
  ));
test(`height:{100.1 TO 200.2}`, () =>
  expect(serialize(parse(`height:{100.1 TO 200.2}`)).sql).toBe(
    "(height > ? AND height < ?)"
  ));
test(`height:{100.1 TO 200.2]`, () =>
  expect(serialize(parse(`height:{100.1 TO 200.2]`)).sql).toBe(
    "(height > ? AND height <= ?)"
  ));

// boolean operators
test(`name:foo AND height:=100`, () =>
  expect(serialize(parse(`name:foo AND height:=100`)).sql).toBe(
    "(LOWER(name) LIKE LOWER(?) AND height = ?)"
  ));
test(`name:foo OR name:bar`, () =>
  expect(serialize(parse(`name:foo OR name:bar`)).sql).toBe(
    "(LOWER(name) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?))"
  ));

// unary operators
test(`NOT foo`, () =>
  expect(serialize(parse(`NOT foo`)).sql).toBe(
    "NOT LOWER(all_fields) LIKE LOWER(?)"
  ));
test(`-foo`, () =>
  expect(serialize(parse(`-foo`)).sql).toBe(
    "NOT LOWER(all_fields) LIKE LOWER(?)"
  ));
test(`NOT foo:bar`, () =>
  expect(serialize(parse(`NOT foo:bar`)).sql).toBe(
    "NOT LOWER(foo) LIKE LOWER(?)"
  ));
test(`-foo:bar`, () =>
  expect(serialize(parse(`-foo:bar`)).sql).toBe(
    "NOT LOWER(foo) LIKE LOWER(?)"
  ));
test(`name:foo AND NOT (bio:bar OR bio:baz)`, () =>
  expect(serialize(parse(`name:foo AND NOT (bio:bar OR bio:baz)`)).sql).toBe(
    "(LOWER(name) LIKE LOWER(?) AND NOT ((LOWER(bio) LIKE LOWER(?) OR LOWER(bio) LIKE LOWER(?))))"
  ));

// implicit AND boolean operator
test(`name:foo height:=100`, () =>
  expect(serialize(parse(`name:foo height:=100`)).sql).toBe(
    "(LOWER(name) LIKE LOWER(?) AND height = ?)"
  ));

// grouping
test(`name:foo AND (bio:bar OR bio:baz)`, () =>
  expect(serialize(parse(`name:foo AND (bio:bar OR bio:baz)`)).sql).toBe(
    "(LOWER(name) LIKE LOWER(?) AND ((LOWER(bio) LIKE LOWER(?) OR LOWER(bio) LIKE LOWER(?))))"
  ));
