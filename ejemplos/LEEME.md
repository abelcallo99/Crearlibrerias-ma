# Archivos de prueba para grandMA2 onPC

Tres fixture types generados por Canalia para comprobar que grandMA2 los importa bien. Cada uno prueba algo distinto:

| Archivo | Qué prueba |
| --- | --- |
| `ejemplo@par_led_18x10_rgbw@8ch.xml` | El caso más sencillo: dimmer, RGBW, estrobo con rangos y canal de modo. Empieza por este. |
| `ejemplo@beam_230@16ch.xml` | Cabeza móvil: pan/tilt de 16 bit, rueda de color y de gobos con rangos, prisma, frost, reset. |
| `ejemplo@barra_led_4_secciones_rgb@14ch.xml` | Aparato multicelda: dimmer y estrobo generales y 4 secciones RGB (módulos e instancias). |

## Cómo probarlos

1. Copia los XML en la carpeta `library` de grandMA2 onPC (o en `gma2/library` de un USB).
2. Crea un show nuevo, ve a *Setup → Patch & Fixture Schedule → Add New Fixtures* e importa el fixture type desde la librería de usuario.
3. Parchea un aparato de cada tipo y comprueba en el Fixture Sheet que salen los canales y que los rangos aparecen en el Smart View.

Si alguno da error al importar, apunta el mensaje exacto (o haz una foto de la pantalla): con eso se corrige el generador.
