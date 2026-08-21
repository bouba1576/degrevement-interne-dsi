/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { isolatedModules: true }],
    // openid-client (KeycloakProvider, 20/08/2026) est distribué exclusivement
    // en ESM ("type": "module") — apps/api compile en CommonJS et le charge
    // via import() dynamique (fonctionne nativement en Node réel, aucun
    // problème en production). Jest, lui, résout tout node_modules via son
    // propre registre CJS par défaut et échoue à parser la syntaxe ESM sans
    // transform dédié — babel-jest scope ici UNIQUEMENT à ce paquet et ses
    // deux dépendances ESM (jose, oauth4webapi), jamais au reste de
    // node_modules ni à nos propres .ts (toujours ts-jest ci-dessus).
    // Ancré sur la structure réelle pnpm (node_modules/.pnpm/<pkg>@<version>/
    // node_modules/<pkg>/...), pas sur un `node_modules/<pkg>/` naïf — vérifié
    // en direct : un motif qui ignore tout SAUF juste après le PREMIER
    // `node_modules/` échoue silencieusement sous pnpm, puisque ce premier
    // segment est suivi de `.pnpm/`, jamais du nom du paquet directement
    // (piège connu pnpm+Jest, pas une supposition). [\\\\/] plutôt que /
    // seul — Jest résout les chemins avec le séparateur natif de l'OS
    // (backslash sous Windows).
    "[\\\\/]\\.pnpm[\\\\/](openid-client|jose|oauth4webapi)@.+\\.js$": [
      "babel-jest",
      { presets: [["@babel/preset-env", { targets: { node: "current" } }]] }
    ]
  },
  // Ancrée en tout début de chaîne (^) — un test par sous-position (sans
  // ancre) retomberait sur le même piège que ci-dessus, la première
  // occurrence de node_modules/ n'étant jamais celle qui compte sous pnpm.
  // Ignore tout chemin node_modules SAUF s'il contient, n'importe où, le
  // segment .pnpm/<paquet>@ d'un des trois paquets ESM ciblés.
  transformIgnorePatterns: [
    "^(?!.*[\\\\/]\\.pnpm[\\\\/](openid-client|jose|oauth4webapi)@).*[\\\\/]node_modules[\\\\/]"
  ],
  testTimeout: 60000,
  setupFiles: ["<rootDir>/test/setup-env.ts"]
};
