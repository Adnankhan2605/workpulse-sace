async function test() {
  const visited = new Set();
  const queue = ["/node_modules/@tanstack/react-start/dist/plugin/default-entry/client.tsx"];
  const errors = [];

  while (queue.length > 0) {
    const urlPath = queue.shift();
    if (visited.has(urlPath)) continue;
    visited.add(urlPath);

    try {
      const res = await fetch("http://localhost:3000" + urlPath);
      if (!res.ok) {
        errors.push({ path: urlPath, status: res.status, statusText: res.statusText });
        continue;
      }
      const text = await res.text();
      // Extract import statements
      const importRegex = /(?:import|export)\s+(?:.*?from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(text)) !== null) {
        let imported = match[1];
        if (imported.startsWith("/")) {
          if (!visited.has(imported)) queue.push(imported);
        } else if (imported.startsWith("./") || imported.startsWith("../")) {
          const dir = urlPath.substring(0, urlPath.lastIndexOf("/"));
          const resolved = new URL(imported, "http://localhost:3000" + dir + "/").pathname;
          if (!visited.has(resolved)) queue.push(resolved);
        }
      }
    } catch (err) {
      errors.push({ path: urlPath, error: err.message });
    }
  }

  console.log("Total visited:", visited.size);
  console.log("Errors:", JSON.stringify(errors, null, 2));
}
test();
