# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - img "Logo" [ref=e4]
    - paragraph [ref=e5]: Inicie sesión para continuar.
  - generic [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e8]: Correo electrónico
      - textbox "Correo electrónico" [ref=e9]: f.santoro@barackmercosul.com
    - generic [ref=e10]:
      - generic [ref=e11]: Contraseña
      - textbox "Contraseña" [active] [ref=e12]: $oof@k24
    - link "¿Olvidaste tu contraseña?" [ref=e14] [cursor=pointer]:
      - /url: "#"
    - button "Iniciar Sesión" [ref=e15] [cursor=pointer]
  - generic [ref=e16]:
    - generic [ref=e17]: ¿No tienes cuenta?
    - link "Regístrate" [ref=e18] [cursor=pointer]:
      - /url: "#"
```