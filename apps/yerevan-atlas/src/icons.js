const paths = {
 building:'<path d="m3 8 9-5 9 5v11l-9 3-9-3Z M12 3v19 M3 8l9 5 9-5 M7 11v7 M17 11v7"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 sliders:'<path d="M4 7h16 M4 17h16 M8 4v6 M16 14v6"/>',
 sparkles:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z M20 2v4 M18 4h4"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 expand:'<path d="M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6 M12 7v1"/>',
 download:'<path d="M12 3v12 m-5-5 5 5 5-5 M4 17v4h16v-4"/>',
 arrow:'<path d="M4 12h16 m-6-6 6 6-6 6"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 compare:'<path d="M5 4v16 M19 4v16 M2 7h6 M16 17h6 M10 8h4 M10 16h4"/>',
 external:'<path d="M14 3h7v7 M10 14 21 3 M10 3H3v18h18v-7"/>',
 check:'<path d="m5 12 4 4 10-10"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6 M17 2v6 M3 11h18"/>',
 area:'<path d="M3 3h18v18H3Z M7 7h10v10 M7 17 17 7"/>',
 layers:'<path d="m12 3 10 6-10 6L2 9Z M2 13l10 6 10-6 M2 17l10 6 10-6"/>',
 list:'<path d="M8 6h13 M8 12h13 M8 18h13 M3 6h1 M3 12h1 M3 18h1"/>',
 link:'<path d="m10 13 4-4 M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 0-6-6L7 5" transform="translate(2 2)"/>',
 home:'<path d="m3 11 9-8 9 8 M5 9v12h14V9 M9 21v-8h6v8"/>',
 note:'<path d="M4 3h12l4 4v14H4Z M8 11h8 M8 15h6 M15 3v5h5"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2"/>'
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.building}</svg>`;
export function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
