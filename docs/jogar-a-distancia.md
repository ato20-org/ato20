# Jogar a distância

A mesa nasce na rede de casa: a TV e os celulares abrem o endereço do computador do mestre
no Wi-Fi. Quem não está na sala entra por um destes três caminhos, e nenhum passa por
servidor do ATO20. A mesa continua no computador do mestre.

| Caminho | O jogador instala | Serve para |
| --- | --- | --- |
| **Internet**, pelo Funnel do Tailscale | nada, só abre o link | o grupo que não vai instalar nada; só o mestre tem o Tailscale |
| **VPN de jogo**: Tailscale, ZeroTier, Hamachi ou Radmin | a mesma VPN do mestre | o grupo fixo que já usa uma |
| **Outro endereço** | depende do que for | quem já tem um nome ou um túnel próprio |

Tudo se escolhe no botão **Entrar na mesa**, no alto da tela do Mestre: as redes que
responderem nesta máquina aparecem como botões acima do QR, e o QR e o link seguem o botão
marcado.

## Pela internet

O Tailscale tem o Funnel, que publica uma porta do computador num endereço
`https://<máquina>.<sua-rede>.ts.net`. O ATO20 abre e fecha o Funnel pela linha de comando do
Tailscale que você instalou, e não guarda a sua conta nem senha nenhuma.

1. Instale o Tailscale no computador do mestre e entre na sua conta.
2. No ATO20, abra **Entrar na mesa**, escolha **Internet** e clique em **Abrir para a
   internet**. A primeira vez leva alguns segundos, porque o Tailscale pede o certificado
   HTTPS.
3. Se aparecer **Liberar o Funnel**, o Funnel ainda está desligado na sua conta. O botão abre
   a página do Tailscale onde se liga; ligue e clique em abrir de novo.
4. Mande o link aos jogadores, ou mostre o QR numa chamada de vídeo. Eles abrem no navegador
   do celular, de qualquer lugar.

Enquanto a mesa está aberta na internet, o botão **Entrar na mesa** mostra um globo no lugar do
QR. Ela fecha quando você clica em **Fechar** ou quando sai do ATO20. Se o aplicativo travar,
ele fecha o Funnel na abertura seguinte, porque o Funnel sobrevive ao processo e até a
reiniciar o computador.

**Para testar, use o celular no 4G**, e não o computador do mestre: nele, o endereço `.ts.net`
aponta para a rede do Tailscale e não passa pela internet.

O que pode aparecer no lugar do botão:

- **"O Linux só deixa o Tailscale abrir a porta para quem é operador dele."** Rode uma vez
  o comando que aparece embaixo, no terminal, e clique em abrir de novo.
- **"O Funnel desta máquina já serve outra coisa na porta 443."** Você usa o Funnel para
  outra coisa, e o ATO20 não o toma. Desligue aquilo para abrir a mesa.
- **"O Tailscale desta máquina está desconectado."** Entre no Tailscale e abra o convite de
  novo.

## Por uma VPN de jogo

Numa VPN, o mestre e os jogadores ficam numa rede particular, como se estivessem no mesmo
Wi-Fi. Só entra quem você convidou para a rede.

1. Ponha todo mundo na mesma rede: a sua rede do Tailscale, a mesma rede do ZeroTier, ou a
   mesma sala do Hamachi ou do Radmin.
2. Com a VPN ligada no computador do mestre, abra **Entrar na mesa**. O nome dela aparece
   entre os botões de rede; escolha-o.
3. O jogador liga a VPN no aparelho dele e lê o QR.

O Radmin só existe para Windows, e o Hamachi não tem aplicativo de celular. Para quem joga
pelo celular, use o Tailscale ou o ZeroTier.

A escolha fica gravada neste computador, e não na campanha. Se a VPN estiver desligada na
sessão seguinte, o convite volta para a rede local e avisa embaixo dos botões. Quando ela
voltar, o convite volta para ela.

O ATO20 reconhece o Tailscale, o Hamachi e o Radmin pela faixa de IP de cada um, e o ZeroTier
pelo nome da placa de rede que ele cria. Se a sua VPN não aparecer, use **Outro endereço**
com o IP que ela deu ao computador do mestre.

### Se o celular não abre

O mais comum é o firewall. No Windows, a primeira vez que o ATO20 abre, o sistema pergunta se
ele pode receber conexões, e a resposta costuma valer só para rede **privada**. A placa da VPN
quase sempre é tratada como rede **pública**. Para liberar:

1. Abra **Segurança do Windows › Firewall e proteção de rede › Permitir um aplicativo pelo
   firewall**.
2. Clique em **Alterar configurações**, ache o ATO20 na lista e marque também a coluna
   **Pública**.

No Linux, o firewall só atrapalha se você ligou um. Com o `ufw`, libere a porta na placa da
VPN (`tailscale0`, ou a que começa com `zt` no ZeroTier):

```bash
sudo ufw allow in on tailscale0 to any port 20200 proto tcp
```

Com o `firewalld`, ponha a placa na zona confiável:

```bash
sudo firewall-cmd --zone=trusted --add-interface=tailscale0 --permanent && sudo firewall-cmd --reload
```

A porta é a 20200. Se ela estiver ocupada quando o ATO20 abre, ele usa outra, e o endereço do
convite mostra qual é.

## Por um endereço seu

**Outro endereço** aceita o que você colar: um nome do MagicDNS do Tailscale
(`pc.sua-rede.ts.net`), um IP, um nome do DuckDNS, ou a URL inteira de um túnel como o
cloudflared ou o ngrok. Sem porta, o ATO20 completa com a dele. Uma URL `https://` fica como
veio, porque o túnel já tem a porta dele.

O ATO20 não testa o endereço: ele só monta o link. Confira abrindo o link num aparelho que
esteja fora da sua rede.

## O que o código da mesa protege

Todo link leva o código de seis caracteres da campanha. Ele não é uma senha forte, e o que
segura cada caminho é diferente:

- **Na rede local e na VPN**, só alcança a mesa quem está na rede. O código evita que alguém
  dali caia na cena por acaso.
- **Na internet**, qualquer pessoa com o link e o código entra. Depois de dez códigos errados
  em dez minutos, o endereço que errou fica bloqueado até a janela passar, mesmo que acerte.
  Mande o link só para quem joga, e feche a mesa no fim da sessão.

Em nenhum caminho alguém de fora mexe na mesa como mestre: as rotas de mestre pedem uma
chave que nasce a cada abertura do ATO20 e nunca sai deste computador. Os detalhes estão em
[O daemon](daemon.md#a-mesa-pela-internet).
