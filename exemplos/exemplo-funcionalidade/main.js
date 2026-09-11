/*
 * O esqueleto de um plugin de funcionalidade.
 *
 * ATENÇÃO: este arquivo AINDA NÃO É EXECUTADO. Esta versão do ATO20 valida o
 * campo `principal` do manifesto e serve o arquivo, mas não o importa — o
 * carregamento é a próxima etapa. O plugin existe aqui para mostrar a forma
 * que o contrato deve ter, e para a tela de Configurações ter o que colocar no
 * grupo "Funcionalidades".
 *
 * O que já vale, e não vai mudar:
 *
 * - É um MÓDULO ESM comum, lido direto do disco. Sem npm, sem bundler, sem
 *   passo de build. O arquivo que você escreve é o arquivo que roda.
 * - Não empacote React. A interface do ATO20 tem uma instância só, e uma
 *   segunda quebraria os hooks dela. O React vem pela API, não pelo seu
 *   `import`.
 *
 * O que está proposto e pode mudar até a Fase 2 fechar: os nomes dentro de
 * `api`.
 */

const plugin = {
  /**
   * Chamado quando o plugin é habilitado.
   *
   * Recebe a API do aplicativo. Tudo que ele registrar devolve uma função de
   * desfazer — é isso que faz desabilitar não pedir reinício.
   */
  ativar(api) {
    // Um painel: vira uma tela que se atraca no dock como qualquer outra.
    //
    // O corpo é uma função de componente React. `api.react` é o MESMO React da
    // interface, e é por isso que ele chega por aqui em vez de ser importado.
    return api.registrar.painel({
      id: "ola",
      titulo: "Olá",
      corpo() {
        return api.react.createElement(
          "p",
          { className: "p-3 text-sm" },
          "Este painel veio de um plugin.",
        );
      },
    });
  },

  /**
   * Chamado quando o plugin é desabilitado ou desinstalado.
   *
   * Opcional: o que `ativar` devolveu já é desfeito pelo aplicativo. Existe
   * para o que o plugin criou por fora — um `setInterval`, um ouvinte no
   * `window`, um arquivo aberto.
   */
  desativar() {},
};

export default plugin;
