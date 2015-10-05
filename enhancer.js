(function($) {

  var getData = function() {

    // pull team names for each game from the page
    var games = [];
    var titleRows = $('#nflpicks tr.subtitle');
    $(titleRows[0]).find('.bg4 td:first-child').each(function(index) {
      var isHome = index % 2;
      var gameIndex = (index - isHome) / 2;
      var teamName = $(this).text();

      if(isHome) {
        games[gameIndex].homeTeam = teamName;
      }
      else {
        games[gameIndex] = { awayTeam: teamName };
      }
    });

    // save a reference to our custom row, creating it if it doesn't exist yet
    var customRow = titleRows[3];
    if(!customRow) {
      // TODO: write makeNewTitleRow
      //customRow = makeNewTitleRow(titleRows[2]);
      //titlesRows[2].append(customRow);
    }

    // pull data for each player's picks from the page
    var players = [];
    var playerRows = $('#nflplayerRows tr');
    playerRows.each(function(playerIndex) {
      var player = { picks: [], isCurrent: $(this).hasClass('bgFan') };
      $(this).find('td').each(function(columnIndex) {
        if(columnIndex) {
          var gameIndex = columnIndex - 1;
          if(gameIndex == games.length) return false;

          var pick = $(this).text();
          player.picks[gameIndex] = pick;

          games[gameIndex].unlocked = $(this).hasClass("unlocked");

          // this is the only way to tell the outcome of the game
          var isCorrect = $(this).hasClass("correct");
          var isInProgress = $(this).hasClass('inprogress');
          if(!isInProgress && (isCorrect || $(this).hasClass("incorrect"))) {
            var game = games[gameIndex];
            game.winner = isCorrect? pick : (pick == game.homeTeam)? game.awayTeam : game.homeTeam;
          }
        }
        else { // stash the element of the player's name, will be updated with win %
          player.nameElement = $(this);
        }
      });
      players[playerIndex] = player;
    });

    // accumulate data about which player wins in all possible outcome permutations
    var winStats = calculateWinStats(games, players);

    return {
      games: games,
      players: players,
      customRow: customRow,
      winStats: winStats
    }
  };

  var calculateWinStats = function(games, players) {
    var winStats = { totalPossibilities: 0, playerToWins: {}, outcomesToWins: [] };
    accummulateAllPossibilities(games, players, [], 0, winStats);
    return winStats;
  }

  // recursively try every outcome permutation and accumulate win stats data for each
  var accummulateAllPossibilities = function(games, players, outcomes, currentIndex, winStats) {
    // we're worked through all the games, time to calculate who won with these outcomes
    if(games.length == currentIndex) {
      calculateWinners(games, players, outcomes, winStats);
      return;
    }

    // if this game is already decided, add the actual winner to the outcome, and recurse
    if(games[currentIndex].winner || games[currentIndex].unlocked) {
      outcomes[currentIndex] = games[currentIndex].winner || "";
      return accummulateAllPossibilities(games, players, outcomes, currentIndex + 1, winStats);
    }

    // otherwise recursively branch we both possible outcomes
    else {
      var outcomes1 = outcomes.slice();
      outcomes1[currentIndex] = games[currentIndex].homeTeam;

      var outcomes2 = outcomes.slice();
      outcomes2[currentIndex] = games[currentIndex].awayTeam;

      accummulateAllPossibilities(games, players, outcomes1, currentIndex + 1, winStats);
      accummulateAllPossibilities(games, players, outcomes2, currentIndex + 1, winStats);
    }
  };

  var calculateWinners = function(games, players, outcomes, winStats) {
    var winners = getWinners(players, outcomes);
    winStats.totalPossibilities++;
    console.log(outcomes);

    // store data about who won with these outcomes
    $.each(winners, function(playerIndex, player) {
      var winShare = 1 / winners.length;
      winStats.playerToWins[player] = (winStats.playerToWins[player] || 0) + winShare;
      if(player.isCurrent) {
        // winStats.outcomeToWins is and array with an entry for each game
        // which is an object where each outcome (team name) maps to the number of wins for this user with that outcome
        $.each(outcomes, function(gameIndex, outcome) {
          var gameOutcomes = winStats.outcomesToWins[gameIndex] || {};
          gameOutcomes[outcome] = (gameOutcomes[outcome] || 0) + winShare;
          winStats.outcomesToWins[gameIndex] = gameOutcomes;
        });
      }
    });
  };

  // return the winning player(s) given these outcomes
  var getWinners = function(players, outcomes) {
    var winners = [];
    var highScore = -1;
    $.each(players, function(playerIndex, player) {
      var score = 0;
      $.each(outcomes, function(gameIndex, outcome) {
        if(player.picks[gameIndex] == outcome) score++;
      });

      if(score > highScore) {
        winners = [player];
      }
      else if(score === highScore) {
        winners.push(player);
      }
    });
    return winners;
  };

  var addDataToPage = function(data) {
    // populate data.customRow
    // add winStats winPercentage
  };

  var run = function() {
    addDataToPage(getData());
  }

  run();

})(jQuery);