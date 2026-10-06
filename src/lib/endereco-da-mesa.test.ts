import { describe, expect, it } from "vitest";

import {
  baseDoEndereco,
  escolherEndereco,
  type EnderecoDetectado,
} from "@/lib/endereco-da-mesa";

describe("baseDoEndereco", () => {
  it("em branco não é endereço", () => {
    expect(baseDoEndereco("", 20200)).toBeNull();
    expect(baseDoEndereco("   ", 20200)).toBeNull();
  });

  it("nome sem porta ganha a porta do daemon", () => {
    expect(baseDoEndereco("valb.tail59085e.ts.net", 20200)).toBe(
      "http://valb.tail59085e.ts.net:20200",
    );
    expect(baseDoEndereco(" 10.147.17.5 ", 20201)).toBe("http://10.147.17.5:20201");
  });

  it("porta escrita vale, mesmo a 80 que a URL esconde", () => {
    expect(baseDoEndereco("mesa.duckdns.org:8080", 20200)).toBe(
      "http://mesa.duckdns.org:8080",
    );
    expect(baseDoEndereco("mesa.duckdns.org:80", 20200)).toBe("http://mesa.duckdns.org");
  });

  it("URL com esquema fica como veio, sem o caminho", () => {
    expect(baseDoEndereco("https://exemplo.playit.gg/", 20200)).toBe(
      "https://exemplo.playit.gg",
    );
    expect(baseDoEndereco("http://pc.local:9000/jogador?code=X", 20200)).toBe(
      "http://pc.local:9000",
    );
  });

  it("caminho sem esquema não confunde a porta", () => {
    expect(baseDoEndereco("pc.local/jogador", 20200)).toBe("http://pc.local:20200");
  });

  it("o que não é host é recusado", () => {
    expect(baseDoEndereco("meu pc", 20200)).toBeNull();
    expect(baseDoEndereco("http://", 20200)).toBeNull();
  });
});

describe("escolherEndereco", () => {
  const local: EnderecoDetectado = { rede: "local", url: "http://192.168.7.40:20200" };
  const tailscale: EnderecoDetectado = {
    rede: "tailscale",
    url: "http://100.72.208.2:20200",
  };

  it("a rede escolhida, quando respondeu", () => {
    expect(escolherEndereco("tailscale", [local, tailscale], null)).toEqual({
      ...tailscale,
      caiu: false,
    });
  });

  it("a VPN desligada cai para a rede local, e diz", () => {
    expect(escolherEndereco("tailscale", [local], null)).toEqual({ ...local, caiu: true });
  });

  it("o endereço do mestre vence o que foi detectado", () => {
    expect(escolherEndereco("outro", [local], "http://pc.ts.net:20200")).toEqual({
      rede: "outro",
      url: "http://pc.ts.net:20200",
      caiu: false,
    });
  });

  it("outro em branco cai para a rede local", () => {
    expect(escolherEndereco("outro", [local], null)).toEqual({ ...local, caiu: true });
  });

  it("sem rede local, qualquer uma que respondeu", () => {
    expect(escolherEndereco("local", [tailscale], null)).toEqual({
      ...tailscale,
      caiu: true,
    });
  });

  it("nada respondeu", () => {
    expect(escolherEndereco("local", [], null)).toBeNull();
    expect(escolherEndereco("outro", [], null)).toBeNull();
  });
});
