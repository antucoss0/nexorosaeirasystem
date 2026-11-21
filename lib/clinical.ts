export type Field = {
  key: string;
  label: string;
  type?: "date" | "number" | "textarea";
  options?: string[];
  result?: boolean;
  multi?: boolean;
};
export type Section = { title: string; fields: Field[] };
const f = (
  key: string,
  label: string,
  options?: string[],
  type?: Field["type"],
  result = false,
): Field => ({ key, label, options, type, result });
const yes = ["Sí", "No"];
export const ultrasoundDefault =
  "Ultrasonido mamario realizado con ultrasonido 5 de CHISON con transductor de 10MHZ.";
export const birads = [
  "0. Estudio no concluyente",
  "1. Mama normal",
  "2. Hallazgos benignos",
  "3. Hallazgos probablemente benignos",
  "4. Probablemente maligno",
  "5. Hallazgos malignos",
];
export const bethesda = [
  "1. Negativa para lesión intraepitelial o malignidad",
  "2. Células escamosas atípicas de significado indeterminado (ASC-US)",
  "3. Células escamosas atípicas, no se puede descartar lesión de alto grado (ASC-H)",
  "4. Lesión escamosa intraepitelial de bajo grado (VPH, displasia leve, NIC 1)",
  "5. Lesión escamosa intraepitelial de alto grado (displasia moderada/severa, carcinoma in situ, NIC 2, NIC 3)",
  "6. Carcinoma epidermoide",
  "7. Células glandulares endocervicales atípicas (AGC)",
  "8. Células glandulares endometriales atípicas (AGC)",
  "9. Células glandulares atípicas (AGC)",
  "10. Adenocarcinoma endocervical in situ",
  "11. Adenocarcinoma (endocervical, endometrial o extrauterino)",
];
export const findings = [
  "1. Trichomonas vaginalis",
  "2. Microorganismos micóticos compatibles con cándida sp",
  "3. Cambio en la flora sugestiva de vaginosis bacteriana",
  "4. Microorganismos compatibles con actinomices sp",
  "5. Cambios celulares compatibles con herpes simple",
  "6. Cambios celulares compatibles con citomegalovirus",
  "7. Metaplasia escamosa tubula o cambios queratolíticos",
  "8. Cambios asociados al embarazo",
  "9. Inflamación (incluye reparación atípica)",
  "10. Atrofia",
  "11. Radioterapia",
  "12. Dispositivo intrauterino",
  "13. Células glandulares post-histerectomía",
  "14. Células endometriales no atípicas en mujeres de 45 o más",
];
export const schemas: Record<string, Section[]> = {
  mamaria: [
    {
      title: "Control y signos vitales",
      fields: [
        f("folio", "Folio EIRA"),
        f("cartilla", "Cuenta con cartilla EIRA", yes),
        ...["Talla", "Peso", "PA", "GLC", "BT", "AT"].map((s) =>
          f(s.toLowerCase(), s),
        ),
      ],
    },
    {
      title: "Datos de identificación · 1–10",
      fields: [
        f("f1", "1. Fecha de atención", undefined, "date"),
        f("f2", "2. Nombre"),
        f("f3", "3. Entidad de nacimiento"),
        f("f4", "4. ID EIRA"),
        f("f5", "5. Fecha de nacimiento", undefined, "date"),
        f("f6", "6. Edad en años", undefined, "number"),
        f("f7", "7. Residencia habitual", undefined, "textarea"),
        f("f8", "8. Teléfono fijo"),
        f("f8_celular", "8. Celular"),
        f("f9", "9. Afiliación", [
          "INSABI",
          "IMSS",
          "ISSSTE",
          "SEDENA",
          "SEMAR",
          "Ninguno",
          "Otro",
        ]),
        f("f9_otro", "9. Otra afiliación"),
        f("f10", "10. Motivo de consulta", undefined, "textarea"),
      ],
    },
    {
      title: "Factores de riesgo · 11–17",
      fields: [
        f("f11", "11. Edad de presentación de la menarca", undefined, "number"),
        f("f12", "12. Familiares con antecedente de cáncer mamario", [
          "Madre",
          "Hermana",
          "Hija",
          "1–2",
          "1–3",
          "2–3",
          "Ninguno",
        ]),
        f("f13", "13. FUM", undefined, "date"),
        f("f14", "14. Anticoncepción · tipo"),
        f("f14_inicio", "14. Inicio", undefined, "date"),
        f("f14_tiempo", "14. Tiempo"),
        f("f14_suspension", "14. Suspensión"),
        f(
          "f15",
          "15. Edad de presentación de la menopausia",
          undefined,
          "number",
        ),
        f("f16", "16. Antecedente de mastografía", yes),
        f("f16_1", "16.1 Fecha de última mastografía", undefined, "date"),
        f(
          "f16_2",
          "16.2 Resultados de última mastografía",
          undefined,
          "textarea",
        ),
        f("f16_observaciones", "16. Observaciones", undefined, "textarea"),
        f("f17", "17. Otros factores de riesgo", undefined, "textarea"),
      ],
    },
    {
      title: "Evaluación diagnóstica · 18–21",
      fields: [
        f(
          "f18",
          "18. Resultados a la exploración clínica",
          undefined,
          "textarea",
        ),
        f("f19", "19. Resultados a la termografía", [
          "Simétrico",
          "Asimétrico",
        ]),
        f("f20", "20. Resultados al ultrasonido", undefined, "textarea"),
        f("f21", "21. Nombre y firma de quien realizó el estudio"),
        f("f21_cedula", "21. Cédula profesional"),
      ],
    },
    {
      title: "Diagnóstico y referencia · 22–24",
      fields: [
        f("f22", "22. BIRADS", birads, undefined, true),
        f("f23", "23. Conducta a seguir", [
          "Detección de rutina en un año",
          "Mastografía de tamizaje",
          "Referencia a evaluación con imagen complementaria",
          "Evaluación en seis meses",
        ]),
        f("f24", "24. Motivo de referencia", [
          "Tumoración palpable",
          "Signos sugestivos",
          "Estudio anormal",
          "Factores de riesgo",
        ]),
        f("notas", "Notas", undefined, "textarea"),
      ],
    },
  ],
  cervix: [
    {
      title: "Identificación de la paciente · 1–10",
      fields: [
        f("folio", "No. de folio"),
        f("f1", "1. Nombre"),
        f("f2", "2. Entidad de nacimiento"),
        f("f3", "3. ID EIRA"),
        f("f4", "4. Fecha de nacimiento", undefined, "date"),
        f("f5", "5. Edad en años", undefined, "number"),
        f("f6", "6. Residencia habitual", undefined, "textarea"),
        f("f6_telefono", "6. Teléfono"),
        f("f7", "7. Otro domicilio"),
        f("f8", "8. Otro teléfono"),
        f("f9", "9. Correo electrónico"),
        f("f10", "10. Afiliación", [
          "INSABI",
          "IMSS",
          "ISSSTE",
          "PEMEX",
          "SEDENA",
          "SEMAR",
          "Ninguno",
          "Otro",
        ]),
        f("f10_1", "10.1 Número de afiliación"),
        f("f10_otro", "10. Otra afiliación"),
      ],
    },
    {
      title: "Antecedentes · 11–22",
      fields: [
        f("f11", "11. Citología", [
          "Primera vez en la vida",
          "Primera vez después de 3 años",
          "Subsecuente",
          "Complementaria a resultado positivo a VPH",
        ]),
        f("f12", "12. Situación ginecoobstétrica", undefined, "textarea"),
        f("f13", "13. Inicio de vida sexual", yes),
        f("f13_1", "13.1 Edad en años", undefined, "number"),
        f("f14", "14. Antecedentes de vacunación VPH", yes),
        f("f14_1", "14.1 Edad en años", undefined, "number"),
        f("f14_2", "14.2 Número de dosis", ["Una", "Dos", "Tres", "Completo"]),
        f("f15", "15. Fecha última de regla", undefined, "date"),
        f("f16", "16. A la exploración se observa", undefined, "textarea"),
        f("f17", "17. Utensilio de toma de muestra", [
          "Espátula de Ayre modificada",
          "Citobrush",
          "Hisopo",
          "Otro",
        ]),
        f("f17_otro", "17. Otro · especifique"),
        f("f18", "18. Cédula profesional responsable de toma"),
        f("f19", "19. Fecha de toma de muestra", undefined, "date"),
        f("f20", "20. Factores de riesgo", undefined, "textarea"),
        f("f21", "21. Cuenta con cartilla EIRA", yes),
        f("f22", "22. Muestra repetida", yes),
        f("f22_1", "22.1 Número citológico anterior"),
      ],
    },
    {
      title: "Resultado de citología · 23–31",
      fields: [
        f("f23", "23. Fecha de interpretación", undefined, "date", true),
        f("f24", "24. Número citológico", undefined, undefined, true),
        f("f25", "25. Laboratorio", undefined, undefined, true),
        f(
          "f26",
          "26. Características de la muestra",
          ["Adecuada", "Inadecuada"],
          undefined,
          true,
        ),
        f(
          "f26_motivo",
          "26. Motivo de muestra inadecuada",
          [
            "Artificios, hemorragia, inflamación y/o necrosis en más del 75% del extendido",
            "Laminilla rota",
            "Frotis grueso",
            "Muestra mal fijada",
            "Otros",
          ],
          undefined,
          true,
        ),
        f("f26_otro", "26. Otros · especifique", undefined, undefined, true),
        f(
          "f27",
          "27. A. Categoría del diagnóstico citológico (BETHESDA)",
          bethesda,
          undefined,
          true,
        ),
        f("f27_1", "27.1 B. Otros hallazgos", findings, undefined, true),
        f("f28", "28. Repetir estudio", yes, undefined, true),
        f("f28_1", "28.1 Motivo", undefined, "textarea", true),
        f(
          "f29",
          "29. Cédula profesional citotecnólogo(a)",
          undefined,
          undefined,
          true,
        ),
        f("f30", "30. Revisada por patólogo(a)", yes, undefined, true),
        f(
          "f30_1",
          "30.1 Diagnóstico del patólogo(a) · categoría A",
          bethesda,
          undefined,
          true,
        ),
        f(
          "f30_2",
          "30.2 Diagnóstico del patólogo(a) · otros hallazgos B",
          findings,
          undefined,
          true,
        ),
        f(
          "f31",
          "31. Cédula profesional del patólogo(a)",
          undefined,
          undefined,
          true,
        ),
      ],
    },
  ],
};
export const clinicalTitles: Record<string, string> = {
  mamaria: "Revisión Mamaria",
  cervix: "Citología Cervical",
};
for (const [key, options] of Object.entries({
  f12: [
    "Puerperio o postaborto",
    "Postmenopausia",
    "Usos hormonales",
    "DIU",
    "Histerectomía",
    "Tratamiento farmacológico",
    "Embarazo actual",
    "Tratamiento colposcópico previo",
    "Ninguno de los anteriores",
  ],
  f16: [
    "Cuello aparentemente sano",
    "Cuello anormal",
    "Lesión del cuello",
    "Cervicitis",
    "Leucorrea",
    "Sangrado anormal",
    "No se observa cuello",
  ],
  f20: [
    "Inicio de relaciones sexuales antes de los 18 años",
    "Múltiples parejas sexuales",
    "Antecedentes de infecciones de transmisión sexual",
    "Tabaquismo",
    "Ninguno",
  ],
})) {
  const field = schemas.cervix
    .flatMap((s) => s.fields)
    .find((f) => f.key === key)!;
  field.options = options;
  field.multi = true;
  delete field.type;
}
for (const key of ["f27_1", "f30_2"])
  schemas.cervix.flatMap((s) => s.fields).find((f) => f.key === key)!.multi =
    true;
export const contactFooter =
  "EIRA · Federico del Toro 83 int. 205, Centro, Ciudad Guzmán, Jalisco, C.P. 49000 · Tel. 3414108111 y 3411596782 · hola@eiraac.org · www.eiraac.org";
export function prefill(kind: string, p: Record<string, any>) {
  const affiliation = (key: string) => {
    const options =
      schemas[kind].flatMap((s) => s.fields).find((f) => f.key === key)
        ?.options || [];
    return options.includes(p.afiliacion)
      ? p.afiliacion
      : p.afiliacion === "Sin afiliación"
        ? "Ninguno"
        : p.afiliacion
          ? "Otro"
          : "";
  };
  const age = p.fecha_nacimiento
    ? String(
        Math.max(
          0,
          Math.floor(
            (Date.now() - Date.parse(p.fecha_nacimiento)) / 31557600000,
          ),
        ),
      )
    : "";
  return kind === "mamaria"
    ? {
        kind,
        f1: new Date().toISOString().slice(0, 10),
        f2: p.nombre_completo,
        f3: p.entidad_nacimiento || "",
        f4: p.id,
        f5: p.fecha_nacimiento,
        f6: age,
        f7: p.residencia || p.municipio,
        f8_celular: p.telefono || "",
        f9: affiliation("f9"),
        f9_otro: affiliation("f9") === "Otro" ? p.afiliacion : "",
        f20: ultrasoundDefault,
      }
    : {
        kind,
        f1: p.nombre_completo,
        f2: p.entidad_nacimiento || "",
        f3: p.id,
        f4: p.fecha_nacimiento,
        f5: age,
        f6: p.residencia || p.municipio,
        f6_telefono: p.telefono || "",
        f8: p.contacto_alterno || "",
        f9: p.email || "",
        f10: affiliation("f10"),
        f10_otro: affiliation("f10") === "Otro" ? p.afiliacion : "",
      };
}
