export async function readStream(stream) {
  let text = '';

  if (typeof stream.setEncoding === 'function') {
    stream.setEncoding('utf8');
  }

  for await (const chunk of stream) {
    text += chunk;
  }

  return text;
}
