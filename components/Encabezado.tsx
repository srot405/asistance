type Props = {
  dark: boolean;
  setDark: (value: boolean) => void;
  demo: boolean;
};
export default function Encabezado({ dark, setDark, demo }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">R</div>
        <div>
          <div className="eyebrow">Fundación ROFÉ · Jóvenes creaTIvos</div>
          <div className="title">Panel de ingresos</div>
        </div>
      </div>
      <div className="toolbar">
        {demo && <span className="demo">DATOS DE DEMOSTRACIÓN</span>}
        <button className="control" onClick={() => setDark(!dark)}>
          {dark ? "☀ Claro" : "◐ Oscuro"}
        </button>
      </div>
    </header>
  );
}
