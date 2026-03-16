<!-- cflmd-metadata: {"pageId":"265021483","version":{"number":2,"time":"2026-03-16T16:50:22Z"}} -->

# Markdown Roundtrip Test Fixture

This file is the principal regression artifact for markdown-to-Confluence-to-markdown roundtrip testing.

It includes *emphasis*, **strong emphasis**, ***combined emphasis***, `inline code`, and `` code spans containing `backticks` `` .

This paragraph wraps across multiple source lines  
without forcing a hard line break.  
This line ends with a hard break.\\  
The next line should remain in the same paragraph.

# Setext Heading Level 1

## Setext Heading Level 2

## ATX Heading Level 2

### ATX Heading Level 3

#### ATX Heading Level 4

##### ATX Heading Level 5

###### ATX Heading Level 6

## Blockquotes

> Outer blockquote paragraph with *inline emphasis*.
> 
> > Nested blockquote paragraph with `inline code`.
> 
> Back in the outer blockquote with an [inline link](https://commonmark.org/).

## Lists

- Unordered item one
- Unordered item two
    - Nested unordered item
    - Nested unordered item with `code`
- Unordered item three

1. Ordered item one
2. Ordered item two
3. Ordered item three

## Links And Images

Inline link: [Example Domain](https://example.com)

Autolink: <https://www.example.org/docs>

Email autolink: <person@example.com>

Standard markdown image:

![Standard markdown image](images/standard-image.png)

## Code Blocks

Indented code block:

```
def indented_block():
    return "indented"
```

Fenced code block:

```json
{
  "format": "markdown",
  "roundtrip": true,
  "features": ["headings", "lists", "code", "links", "images"]
}
```

## Escaping

Escaped punctuation should stay literal: \\*asterisks\\*, \\\[brackets\\\], \\#hash, and \\`backtick\\`.

---

## HTML Table

<table>
  <thead>
    <tr>
      <th>**Column**</th>
      <th>**Value**</th>
      <th>**Notes**</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>alpha</td>
      <td>1</td>
      <td>plain text cell</td>
    </tr>
    <tr>
      <td>beta</td>
      <td>2</td>
      <td>contains &amp; entity</td>
    </tr>
    <tr>
      <td>gamma</td>
      <td>3</td>
      <td><code>inline html code</code></td>
    </tr>
  </tbody>
</table>
