# Instalar

No Linux, o AppImage roda sem instalar nada:

```bash
curl -fL -o ato20.AppImage https://github.com/ato20-org/ato20/releases/download/v1.2.0/ato20_1.2.0_amd64.AppImage && chmod +x ato20.AppImage
./ato20.AppImage
```

No Windows, pelo PowerShell:

```powershell
wget https://github.com/ato20-org/ato20/releases/download/v1.2.0/ato20_1.2.0_x64-setup.exe -OutFile ato20-setup.exe
.\ato20-setup.exe
```

**Esse `wget` é o apelido do `Invoke-WebRequest`,** e não o wget do GNU — por isso `-OutFile`
e não `-O`. O apelido existe no Windows PowerShell 5.1, que é o que vem na máquina. No
PowerShell 7 ele foi removido; lá o comando é `curl.exe` na mesma forma do Linux:

```powershell
curl.exe -fL -o ato20-setup.exe https://github.com/ato20-org/ato20/releases/download/v1.2.0/ato20_1.2.0_x64-setup.exe
```

O `.exe` no final não é enfeite: sem ele o PowerShell 5.1 resolve `curl` para o mesmo
`Invoke-WebRequest`, que não entende `-fL` e falha.

**As URLs acima fixam a versão porque o nome do arquivo a carrega dentro.** O atalho
`releases/latest/download/` do GitHub voltou a funcionar na 0.1.0 — ele ignora
pré-lançamento, e até a 0.0.6 toda release era uma —, mas o que ele resolve é a release, não
o nome do pacote: `ato20_1.2.0_amd64.AppImage` deixa de existir na versão seguinte. Para um
comando que não envelhece, peça o nome à API:

```bash
curl -fL -o ato20.AppImage "$(curl -fsSL https://api.github.com/repos/ato20-org/ato20/releases/latest \
  | grep -o 'https://[^"]*amd64\.AppImage')" && chmod +x ato20.AppImage
```

A API anônima do GitHub dá 60 chamadas por hora por IP, o que basta para baixar mas não para
um script que roda em laço.

Quem já tem o aplicativo instalado não precisa de nada disso: **da 0.1.0 em diante ele avisa
sozinho** quando sai versão nova.

Os outros formatos — `.deb`, `.rpm` e `.msi` — estão em
[releases](https://github.com/ato20-org/ato20/releases), com o que mudou em cada
versão.
