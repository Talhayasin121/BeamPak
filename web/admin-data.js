export function downloadCsv(filename,rows) {
  const quote=value=>{
    const raw=String(value ?? '');
    const safe=/^\s*[=+\-@]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"','""') + '"';
  };
  const contents='\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  link.hidden=true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
