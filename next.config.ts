import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * HTML estático, sem servidor Next em produção.
   *
   * Quem serve o bundle é o daemon do aplicativo: a webview do Operador o lê
   * do disco, e a TV e os celulares o recebem pela rede local. Manter um
   * servidor Node dentro do executável seria um runtime a mais para empacotar
   * e um processo a mais para o usuário ver morrer.
   *
   * O que isto proíbe já não existe aqui: `proxy` (o antigo `middleware`),
   * rotas de API e Server Actions saíram junto com o portão de acesso e o
   * Supabase.
   */
  output: "export",

  images: {
    /**
     * Sem otimizador: ele é um serviço em tempo de requisição, e não há
     * requisição a servir. As imagens da interface são importadas do bundle, e
     * o material da campanha nunca passou pelo `next/image` -- vem do daemon,
     * medido no envio.
     */
    unoptimized: true,
  },
};

export default nextConfig;
