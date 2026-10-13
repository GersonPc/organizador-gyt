export function archiveNameKey(name: string) {
  return name.normalize('NFC').toLowerCase();
}

// Keep every file when data from the PDF or original filenames collide.
export function reserveArchiveName(name: string, used: Set<string>) {
  const extension = name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] || '';
  const base = extension ? name.slice(0, -extension.length) : name;
  let available = name;
  let number = 2;
  while (used.has(archiveNameKey(available))) available = `${base} (${number++})${extension}`;
  used.add(archiveNameKey(available));
  return available;
}
