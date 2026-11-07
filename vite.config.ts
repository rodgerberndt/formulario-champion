import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Identidade do build. Vai embutida no bundle (__BUILD_ID__) e publicada em
// /version.json: o painel aberto no celular do SDR compara as duas e sabe que
// ficou para trás sem ninguém precisar mandar ele recarregar.
const BUILD_ID = new Date().toISOString();

function versaoDoBuild(): Plugin {
  return {
    name: "champion-build-id",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    rollupOptions: {
      output: {
        // O sufixo fixo renomeia TODOS os arquivos de uma vez. Em 14/09/2026 um
        // chunk foi pedido ao www segundos depois do deploy, antes de o arquivo
        // chegar ao edge: veio o index.html com `immutable` de 1 ano e o
        // navegador guardou o HTML no nome do .js. Trocar o sufixo é a forma de
        // escapar de um cache envenenado sem depender do conteúdo mudar.
        entryFileNames: "assets/[name]-[hash]-r2.js",
        chunkFileNames: "assets/[name]-[hash]-r2.js",
        assetFileNames: "assets/[name]-[hash]-r2[extname]",
      },
    },
  },
  plugins: [react(), versaoDoBuild(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime.js"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
    force: true,
  },
}));
