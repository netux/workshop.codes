import { compileVariables, excludeDefaultVariableNames, getDefaultVariableNameIndex, getVariables } from "../../../../app/javascript/src/utils/compiler/variables"
import { completionsMap } from "../../../../app/javascript/src/stores/editor"
import { disregardWhitespace } from "../../helpers/text"

describe("variables.js", () => {
  describe("getVariables", () => {
    test("Should extract global variables", () => {
      const input = `
        Global.variable1 = Test;
        Set Global Variable(variable2, Test);
        Modify Global Variable(variable3, Test);
        Set Global Variable(variable4, Test);
        Modify Global Variable(variable5, Test);
        Chase Global Variable At Rate(variable6, Test, ...);
        Chase Global Variable Over Time(variable7, Test, ...);
        For Global Variable(variable8, 0, 1, 1);
      `
      const expectedOutput = {
        globalVariables: ["variable1", "variable2", "variable3", "variable4", "variable5", "variable6", "variable7", "variable8"],
        playerVariables: []
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Global variables should only contain letters, numbers, or an underscore", () => {
      // caughtByTheGame means the variable is technically an error in-game,
      // but we leave informing users of that fact to our Linter
      const input = `
        Global.variable1;
        Global.vArIaBlE;
        Global.variable_1;
        Global.1caughtByTheGame;
        Global.variable2+5;
        Global.$notAValidVariable;
        Global.TorbTurret+Up*2;

        Set Global Variable($caughtByTheGame, whatever);
      `
      const expectedOutput = {
        globalVariables: [
          "variable1",
          "vArIaBlE",
          "variable_1",
          "1caughtByTheGame",
          "variable2",
          "TorbTurret",
          "$caughtByTheGame"
        ],
        playerVariables: []
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should extract simple player variables", () => {
      const input = `
        Event Player.variable1 = Test;
        Victim.variable2 = Test;
        Attacker.variable3 = Test;
        Healer.variable4 = Test;
        Healee.variable5 = Test;
        Local Player.variable6 = Test;
        Host Player.variable7 = Test;
        Set Player Variable(Event Player, variable8, Test);
        Set Player Variable At Index(Event Player, variable9, Test);
        Modify Player Variable(Event Player, variable10, Test);
        Modify Player Variable At Index(Event Player, variable11, Test);
        Chase Player Variable At Rate(Event Player, variable12, Test, ...);
        Chase Player Variable Over Time(Event Player, variable13, Test, ...);
        For Player Variable(Event Player, variable14, 0, 1);
      `
      const expectedOutput = {
        globalVariables: [],
        playerVariables: ["variable1", "variable2", "variable3", "variable4", "variable5", "variable6", "variable7", "variable8", "variable9", "variable10", "variable11", "variable12", "variable13", "variable14"]
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Player variables should only contain letters, numbers, or an underscore", () => {
      // caughtByTheGame means the variable is technically an error in-game,
      // but we leave informing users of that fact to our Linter
      const input = `
        Event Player.variable1;
        Event Player.vArIaBlE;
        Event Player.variable_1;
        Event Player.1caughtByTheGame;
        Event Player.variable2+5;
        Event Player.$notAValidVariable;
        Event Player.TorbTurret+Up*2

        Set Player Variable(Event Player, $caughtByTheGame, whatever);
      `
      const expectedOutput = {
        globalVariables: [],
        playerVariables: [
          "variable1",
          "vArIaBlE",
          "variable_1",
          "1caughtByTheGame",
          "variable2",
          "TorbTurret",
          "$caughtByTheGame"
        ]
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should handle nested player variables", () => {
      const input = `
        Event Player.variableA.variableB = Test;
        Event Player.variableA.variableB.variableC = Test;
        Event Player.variableC[0].variableD = Test;
      `
      const expectedOutput = {
        globalVariables: [],
        playerVariables: ["variableA", "variableB", "variableC", "variableD"]
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should handle player variables nested in global variables", () => {
      const input = `
        Global.variableA.variableB = Test;
        Global.variableC[0].variableD = Test;
      `
      const expectedOutput = {
        globalVariables: ["variableA", "variableC"],
        playerVariables: ["variableB", "variableD"]
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should handle no variables present", () => {
      const input = "Just Some Action;"
      const expectedOutput = {
        globalVariables: [],
        playerVariables: []
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should ignore decimals of a number", () => {
      const expectedOutput = {
        globalVariables: [],
        playerVariables: []
      }

      const input = `
        1.234;
        1.abc;
        .1234;
        Wait(.1234);
      `
      expect(getVariables(input)).toEqual(expectedOutput)

      const specialCaseBeginningOfText1Input = ".1234"
      expect(getVariables(specialCaseBeginningOfText1Input)).toEqual(expectedOutput)

      const specialCaseBeginningOfText2Input = ".abcd"
      expect(getVariables(specialCaseBeginningOfText2Input)).toEqual(expectedOutput)
    })

    test("Should not ignore nested variables ending in a number", () => {
      const input = `
        Event Player.variable1.variable2;
      `
      const expectedOutput = {
        globalVariables: [],
        playerVariables: ["variable1", "variable2"]
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should ignore constants with periods", () => {
      const input = "Hero(D.Va)"
      const expectedOutput = {
        globalVariables: [],
        playerVariables: []
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should not ignore player variables that look like constants with periods", () => {
      const input = "Event Player.D.Va"
      const expectedOutput = {
        globalVariables: [],
        playerVariables: ["D", "Va"]
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should ignore variable-likes inside strings", () => {
      const input = "Custom String(\"Hello.World I8.5.3\")"
      const expectedOutput = {
        globalVariables: [],
        playerVariables: []
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should ignore variable-likes when there is a symbol behind them", () => {
      const input = "Wait(.15)"
      const expectedOutput = {
        globalVariables: [],
        playerVariables: []
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should not ignore player variables coming after a value with arguments", () => {
      const input = "Ray Cast Hit Player(bla, bla, bla).variableA.variableB"
      const expectedOutput = {
        globalVariables: [],
        playerVariables: ["variableA", "variableB"]
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })

    test("Should handle duplicate variables", () => {
      const input = `
        Global.variable1 = 10;
        Global.variable2 = 20;
        Global.variable2 = 30;
        For Global Variable(variable1, 0, 1) {
          // Do something
        }
      `
      const expectedOutput = {
        globalVariables: ["variable1", "variable2"],
        playerVariables: []
      }
      expect(getVariables(input)).toEqual(expectedOutput)
    })
  })

  describe("compileVariables", () => {
    test("Should compile variables", () => {
      const input = `
        Global.variable1 = Test;
        Global.variable2 = Test;
        For Global Variable(variable3, 0, 1) {
          // Do something
        }

        Event Player.variable1 = Test
      `
      const expectedOutput = `
        variables {
          global:
            0: variable1
            1: variable2
            2: variable3
          player:
            0: variable1
        }\n\n
      `
      expect(disregardWhitespace(compileVariables(input))).toBe(disregardWhitespace(expectedOutput))
    })

    test("Should exclude default variables if their index is different from the default", () => {
      const input = `
        Global.A;
        Global.variable;
        Global.B;
        Global.Z;
        Global.AA;
        Global.DX;
        Global.DY;

        Event Player.A;
        Event Player.variable;
        Event Player.B;
        Event Player.Z;
        Event Player.AA;
        Event Player.DX;
        Event Player.DY;
      `
      const expectedOutput = `
        variables {
          global:
            0: A
            1: variable
            2: B
            3: AA
            4: DX
            5: DY
          player:
            0: A
            1: variable
            2: B
            3: AA
            4: DX
            5: DY
        }\n\n
      `
      expect(disregardWhitespace(compileVariables(input))).toBe(disregardWhitespace(expectedOutput))
    })
  })

  describe("excludeDefaultVariableNames", () => {
    test("Should not exclude A as it is at its default index (0)", () => {
      const input = [
        "A"
      ]
      const expectedOutput = [
        "A"
      ]
      expect(excludeDefaultVariableNames(input)).toStrictEqual(expectedOutput)
    })

    test("Should not exclude A as the variable at the default index of A (0) was already defined with another name", () => {
      const input = [
        "someNameThatIsNotA",
        "A"
      ]
      const expectedOutput = [
        "someNameThatIsNotA",
        "A"
      ]
      expect(excludeDefaultVariableNames(input)).toStrictEqual(expectedOutput)
    })

    test("Should exclude B as there aren't enough variables to reach the default index of B (1)", () => {
      const input = [
        "B"
      ]
      const expectedOutput = [
      ]
      expect(excludeDefaultVariableNames(input)).toStrictEqual(expectedOutput)
    })

    test("Should exclude Z as there is no variable at the default index of Z (25)", () => {
      const input = [
        "someVar1",
        "someVar2",
        "Z",
        "someVar3",
        "someVar4"
      ]
      const expectedOutput = [
        "someVar1",
        "someVar2",
        "someVar3",
        "someVar4"
      ]
      expect(excludeDefaultVariableNames(input)).toStrictEqual(expectedOutput)
    })

    test("Should exclude C and D as there are no variable at their default indices", () => {
      const input = [
        "C",
        "D"
      ]
      const expectedOutput = [
        // None
      ]
      expect(excludeDefaultVariableNames(input)).toStrictEqual(expectedOutput)
    })

    test("Should not exclude AA as its default index (26) is past the max initial variable indices (up to 25)", () => {
      const input = [
        "AA"
      ]
      const expectedOutput = [
        "AA"
      ]
      expect(excludeDefaultVariableNames(input)).toStrictEqual(expectedOutput)
    })
  })

  describe("getDefaultVariableNameIndex", () => {
    test("Should give a correct value for A and Z", () => {
      const expectedOutput = {
        "A": 0,
        "B": 1,
        "Y": 24,
        "Z": 25
      }

      expect(
        Object.fromEntries(Object.keys(expectedOutput).map((name) => [name, getDefaultVariableNameIndex(name)]))
      ).toStrictEqual(expectedOutput)
    })

    test("Should give a correct value for AA and ZZ", () => {
      const expectedOutput = {
        "AA": 26,
        "DX": 127,
        "DY": 128,
        "ZZ": 701
      }

      expect(
        Object.fromEntries(Object.keys(expectedOutput)
          .map((name) => [name, getDefaultVariableNameIndex(name)]))
      ).toStrictEqual(expectedOutput)
    })

    test("Should get Global variables from parameter objects", () => {
      completionsMap.set(setCompletionsMap("For Global Variable"))
      const input = "For Global Variable({ One: variable1, Two: Global.variable2, Three: Count Of(Array()), Four: 1 })"
      const expectedOutput = {
        globalVariables: ["variable2", "variable1"],
        playerVariables: []
      }
  
      expect(getVariables(input)).toEqual(expectedOutput)
    })
  
    test("Should get variables from nested parameter objects", () => {
      completionsMap.set(setCompletionsMap("For Global Variable"))
      const input =
        `For Global Variable({
          One: variable1,
          Two: 0,
          Three: Some Action({ 
            First: Global.variable2,
            Second: Event Player.variable3
          }),
          Four: 1
        })`
      const expectedOutput = {
        globalVariables: ["variable2", "variable1"],
        playerVariables: ["variable3"]
      }
  
      expect(getVariables(input)).toEqual(expectedOutput)
    })
  
    test("Should get Player variables from parameter objects", () => {
      completionsMap.set(setCompletionsMap("Chase Player Variable Over Time"))
      const input =
        `Chase Player Variable Over Time({ 
          One: Event Player,
          Two: variable1,
          Three: 0,
          Four: 1,
          Five: Destination And Duration
        })`
      const expectedOutput = {
        globalVariables: [],
        playerVariables: ["variable1"]
      }
  
      expect(getVariables(input)).toEqual(expectedOutput)
    })
  })
})

function setCompletionsMap(actionLabel) {
  return [{
    label: actionLabel,
    args_length: 4,
    parameter_keys: ["One", "Two", "Three", "Four"],
    parameter_defaults: ["A", "B", "C", "D"]
  }, {
    label: "Some Action",
    args_length: 4,
    parameter_keys: ["First", "Second", "Third", "Fourth"],
    parameter_defaults: ["A", "B", "C", "D"]
  }]
}
